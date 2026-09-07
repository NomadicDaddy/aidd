import type { DirectorCycleAutoLaunch } from 'aidd-shared';
import type { ResolvedDirectorSuggestionsAutoLaunchConfig } from 'aidd-shared/config/types';

import { and, eq, isNull, lt, or } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { DirectorConfig } from './types.ts';

import { directorCycles } from '../../db/schema.ts';
import { autoLaunchBounds } from './autoLaunchWiring.ts';

/**
 * The durable half of "this cycle is owed a look at its own suggestions".
 *
 * The decision used to live only in the call that followed `persistCycleResult`. Persisting a
 * cycle and dispatching its suggestions were two operations with a gap between them, and anything
 * that ended the process in that gap — a restart, a crash, an operator stopping the panel — left a
 * completed automatic cycle whose suggestions nothing would consider again. Nothing could tell that
 * state from a cycle the launcher was never meant to run for: both stored NULL.
 *
 * So the obligation is a column, written in the cycle's own transaction, and the dispatch is a
 * claim against it. Every function here operates on `director_cycles` alone and each is a single
 * statement, so the claim is a compare-and-set and two dispatches of one cycle cannot both win.
 */

/**
 * How long a 'processing' claim is honoured before another dispatch may take it.
 *
 * A dispatch spawns runs; it does not wait for them, so it is seconds of work. Ten minutes is long
 * enough that a slow project listing or a stalled `git status` is never mistaken for a dead
 * process, and short enough that a genuine crash is recovered on the next startup rather than
 * leaving the cycle claimed forever.
 */
export const AUTO_LAUNCH_CLAIM_STALE_MS = 10 * 60_000;

/** The bounds a cycle was completed under, preserved so later Settings cannot widen them. */
export interface PreservedAutoLaunchBounds {
	config: ResolvedDirectorSuggestionsAutoLaunchConfig;
	dirtyTreeThreshold: number;
}

/** What `persistCycleResult` commits alongside the terminal cycle update. */
export interface AutoLaunchDecision {
	bounds: string;
	state: 'disabled' | 'pending';
}

/**
 * The decision to record for a cycle that is completing now.
 *
 * `disabled` rather than `pending` when auto-launch is off, so a cycle completed while the feature
 * was switched off is never resumed later by a restart that finds it enabled. The bounds are
 * captured either way: they are what an operator reads to see which rules a historical cycle was
 * judged against.
 *
 * @param config The resolved config in force as the cycle completes.
 * @returns The state and the serialized bounds to commit with the cycle.
 */
export function buildAutoLaunchDecision(config: DirectorConfig): AutoLaunchDecision {
	const bounds: PreservedAutoLaunchBounds = {
		config: autoLaunchBounds(config),
		dirtyTreeThreshold: config.dirtyTreeThreshold,
	};
	return {
		bounds: JSON.stringify(bounds),
		state: bounds.config.enabled ? 'pending' : 'disabled',
	};
}

/**
 * Reads back the bounds a cycle was completed under.
 *
 * Null on anything unreadable — an absent column on a row written before this existed, or JSON that
 * does not parse. The caller falls back to the live bounds there, which is the pre-existing
 * behaviour and no worse than it was; what must not happen is a malformed snapshot stopping a
 * dispatch outright.
 *
 * @param value The stored JSON, if any.
 * @returns The preserved bounds, or null when there are none to read.
 */
export function parsePreservedBounds(value: null | string): null | PreservedAutoLaunchBounds {
	if (!value) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		if (!parsed || typeof parsed !== 'object') return null;
		const candidate = parsed as Partial<PreservedAutoLaunchBounds>;
		if (!candidate.config || typeof candidate.dirtyTreeThreshold !== 'number') return null;
		return { config: candidate.config, dirtyTreeThreshold: candidate.dirtyTreeThreshold };
	} catch {
		return null;
	}
}

/** What a claim attempt found: whether it won, and the bounds it must judge the cycle under. */
export interface AutoLaunchClaim {
	bounds: null | PreservedAutoLaunchBounds;
	claimed: boolean;
}

/**
 * Claims a cycle's pending auto-launch decision, or reports that there was none to claim.
 *
 * The whole gate is in the WHERE clause, and deliberately so: an automatic cycle, completed, whose
 * decision is unclaimed. A person's cycle, a failed one, one already finalized, one where
 * auto-launch was off at completion, and one another dispatch is holding all fail to match, and the
 * caller cannot proceed past a lost claim because it has nothing to proceed with.
 *
 * NULL counts as unclaimed. Those are the rows completed before the column existed, and refusing
 * them would silently stop auto-launch for every cycle already on disk.
 *
 * A 'processing' claim older than {@link AUTO_LAUNCH_CLAIM_STALE_MS} is taken over. That is the
 * interrupted case: a dispatch that claimed the cycle and died before finalizing it.
 *
 * @param db The web database.
 * @param cycleId The cycle to claim.
 * @param now The current time, threaded so tests can age a claim without waiting.
 * @returns Whether this caller now owns the dispatch, and the bounds it was completed under.
 */
export async function claimAutoLaunchDecision(
	db: WebDatabase,
	cycleId: string,
	now: number,
): Promise<AutoLaunchClaim> {
	const claimed = await db
		.update(directorCycles)
		.set({ autoLaunchClaimedAt: now, autoLaunchState: 'processing' })
		.where(
			and(
				eq(directorCycles.id, cycleId),
				eq(directorCycles.initiator, 'automatic'),
				eq(directorCycles.status, 'completed'),
				or(
					isNull(directorCycles.autoLaunchState),
					eq(directorCycles.autoLaunchState, 'pending'),
					and(
						eq(directorCycles.autoLaunchState, 'processing'),
						lt(directorCycles.autoLaunchClaimedAt, now - AUTO_LAUNCH_CLAIM_STALE_MS),
					),
				),
			),
		)
		.returning({ bounds: directorCycles.autoLaunchBounds });
	const row = claimed[0];
	if (!row) return { bounds: null, claimed: false };
	return { bounds: parsePreservedBounds(row.bounds), claimed: true };
}

/**
 * Closes a claimed decision, recording what the dispatch did.
 *
 * Guarded on 'processing' so a finalize can only ever close the claim it belongs to. `outcome` is
 * null when auto-launch was off: the state still moves to finalized — the decision was made, and
 * the answer was "nothing" — while `auto_launch` stays NULL, which is what keeps "the launcher
 * never considered this cycle" readable afterwards.
 *
 * @param db The web database.
 * @param cycleId The cycle whose claim is being closed.
 * @param outcome What was launched and passed over, or null when auto-launch is off.
 */
export async function finalizeAutoLaunchDecision(
	db: WebDatabase,
	cycleId: string,
	outcome: DirectorCycleAutoLaunch | null,
): Promise<void> {
	await db
		.update(directorCycles)
		.set({
			autoLaunchState: 'finalized',
			...(outcome === null ? {} : { autoLaunch: JSON.stringify(outcome) }),
		})
		.where(
			and(eq(directorCycles.id, cycleId), eq(directorCycles.autoLaunchState, 'processing')),
		);
}

/**
 * The completed automatic cycles still owed a dispatch, for the reconciliation pass at startup.
 *
 * Pending means the process that persisted the cycle never got to dispatch it. Stale processing
 * means it started and did not finish. Nothing else is listed — finalized, disabled, failed, and
 * operator-started cycles are all decisions already taken, and re-running one would launch work a
 * second time from suggestions somebody has since acted on.
 *
 * Rows with a NULL state are deliberately absent too. Those predate the column, so "owed a
 * dispatch" cannot be established for them; the hook still claims them when a cycle completes, but
 * a restart does not go looking through the whole history for them.
 *
 * @param db The web database.
 * @param now The current time, against which a processing claim is aged.
 * @returns The cycle ids to dispatch, oldest first.
 */
export async function resumableAutoLaunchCycleIds(db: WebDatabase, now: number): Promise<string[]> {
	const rows = await db
		.select({ id: directorCycles.id, startedAt: directorCycles.startedAt })
		.from(directorCycles)
		.where(
			and(
				eq(directorCycles.initiator, 'automatic'),
				eq(directorCycles.status, 'completed'),
				or(
					eq(directorCycles.autoLaunchState, 'pending'),
					and(
						eq(directorCycles.autoLaunchState, 'processing'),
						lt(directorCycles.autoLaunchClaimedAt, now - AUTO_LAUNCH_CLAIM_STALE_MS),
					),
				),
			),
		)
		.orderBy(directorCycles.startedAt);
	return rows.map((row) => row.id);
}
