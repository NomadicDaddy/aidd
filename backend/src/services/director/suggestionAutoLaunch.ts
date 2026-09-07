import type { DirectorAutoLaunchSkipped, DirectorCycleAutoLaunch } from 'aidd-shared';
import type { ResolvedDirectorSuggestionsAutoLaunchConfig } from 'aidd-shared/config/types';

import type { WebDatabase } from '../../db/client.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { PreservedAutoLaunchBounds } from './autoLaunchDecision.ts';
import type { AutoLaunchCandidate } from './suggestionAutoLaunchBounds.ts';
import type { ProjectFactsSource } from './suggestionAutoLaunchFacts.ts';
import type { DirectorSuggestionLaunch } from './suggestionService.ts';

import { webLogger } from '../../logger.ts';
import { claimAutoLaunchDecision, finalizeAutoLaunchDecision } from './autoLaunchDecision.ts';
import { broadcastCycle } from './cyclePersistence.ts';
import {
	intrinsicRefusal,
	projectRefusal,
	quotaRefusal,
	siblingRefusal,
} from './suggestionAutoLaunchBounds.ts';
import { ProjectFactsCache } from './suggestionAutoLaunchFacts.ts';
import { SuggestionClaimLostError } from './suggestionService.ts';

/**
 * The Director starting its own suggestions at the end of an automatic cycle.
 *
 * This is the bounded suggestion decision inside Director autopilot. Its bounds in
 * `suggestionAutoLaunchBounds.ts` are the whole of the decision: nothing evaluated after them may
 * widen what they found eligible, so the blast radius of an automatic cycle is exactly what the
 * bounds describe.
 *
 * Never throws. The cycle has already completed and been persisted by the time this runs; a failure
 * to start follow-on work must not retroactively spoil the cycle that produced it.
 */

export interface SuggestionAutoLaunchDeps extends ProjectFactsSource {
	/** The bounds in force, read fresh per cycle so a Settings change applies without a restart. */
	config: ResolvedDirectorSuggestionsAutoLaunchConfig;
	/** The install-wide dirty-file ceiling that ordinary run preflight already honours. */
	dirtyTreeThreshold: number;
	launch(suggestionId: string): Promise<DirectorSuggestionLaunch>;
	/** Suggestions still pending from this cycle, in the cycle's own rank order. */
	listPending(cycleId: string): Promise<AutoLaunchCandidate[]>;
}

export interface CycleAutoLaunchRunnerDeps {
	db: WebDatabase;
	hub: WebSocketHub;
	/**
	 * Built per cycle rather than once at construction, so a bound edited in Settings applies to
	 * the next cycle without restarting the panel.
	 */
	resolveDeps: () => SuggestionAutoLaunchDeps;
}

/**
 * Claims a cycle's auto-launch decision and dispatches it.
 *
 * Fired by the cycle executor once results are persisted, and again by `reconcileStaleCycles` at
 * startup for every cycle whose decision the last process did not close. Both callers run exactly
 * this, because the decision to proceed is not theirs: it is the compare-and-set in
 * `claimAutoLaunchDecision`, which reads the cycle's own row. A person's cycle, a failed one, one
 * already finalized, one completed while auto-launch was off, and one another dispatch is holding
 * all fail to claim, and this returns having started nothing.
 *
 * That is also what makes it idempotent. Calling it twice for one cycle — the hook racing a
 * reconciliation, two reconciliations overlapping — dispatches once, because the second caller
 * loses the claim rather than re-reading a state the first has already moved on from.
 *
 * @param deps The database, the broadcast hub, and a builder for the launcher's own collaborators.
 * @param cycleId The cycle whose decision is being dispatched.
 */
export async function runCycleAutoLaunch(
	deps: CycleAutoLaunchRunnerDeps,
	cycleId: string,
): Promise<void> {
	try {
		const claim = await claimAutoLaunchDecision(deps.db, cycleId, Date.now());
		if (!claim.claimed) return;
		const outcome = await autoLaunchCycleSuggestions(
			boundedBy(deps.resolveDeps(), claim.bounds),
			cycleId,
		);
		// Finalized whatever the answer was, including the empty one. An unclosed claim is an
		// obligation the next startup would pick up again, and a cycle whose suggestions have
		// already been considered must not be considered a second time.
		await finalizeAutoLaunchDecision(deps.db, cycleId, outcome);
		// Re-announced so Recent Cycles picks the record up without waiting for a poll. The cycle's
		// status and stage are unchanged; only what it started afterwards is new. Nothing to
		// announce when auto-launch is off — there is no record for a reader to pick up.
		if (outcome !== null) broadcastCycle(deps.hub, cycleId, 'completed', 'completed');
	} catch (err) {
		// The claim stays open. It is dated, so the next startup finds it stale and dispatches the
		// cycle rather than leaving it stranded on a failure nobody was watching.
		webLogger.warn({ cycleId, err }, 'Recording Director suggestion auto-launch failed');
	}
}

/**
 * The launcher's collaborators, judged under the bounds the cycle was completed with.
 *
 * A cycle finished last night proposed work that last night's rules found acceptable. If the
 * dispatch reads today's Settings instead, raising the risk ceiling this morning retroactively
 * makes last night's riskier suggestions launchable — work an operator never approved under the
 * rules in force when it was proposed. So the snapshot wins where there is one, and the live bounds
 * serve only rows that predate the snapshot.
 *
 * @param deps The collaborators as the panel wires them, carrying the live bounds.
 * @param preserved The bounds recorded when the cycle completed, or null when none were.
 * @returns The collaborators to judge this cycle with.
 */
function boundedBy(
	deps: SuggestionAutoLaunchDeps,
	preserved: null | PreservedAutoLaunchBounds,
): SuggestionAutoLaunchDeps {
	if (preserved === null) return deps;
	return {
		...deps,
		config: preserved.config,
		dirtyTreeThreshold: preserved.dirtyTreeThreshold,
	};
}

/**
 * Considers one completed automatic cycle's pending suggestions and launches what the bounds allow.
 *
 * @param deps The collaborators and the bounds in force.
 * @param cycleId The cycle whose suggestions are being considered.
 * @returns What was launched and what was passed over, or null when auto-launch is switched off —
 * the one case where there is genuinely nothing to tell an operator, because they turned it off.
 */
export async function autoLaunchCycleSuggestions(
	deps: SuggestionAutoLaunchDeps,
	cycleId: string,
): Promise<DirectorCycleAutoLaunch | null> {
	if (!deps.config.enabled) return null;
	try {
		return await considerAndLaunch(deps, cycleId);
	} catch (err) {
		// Reaching here means a collaborator failed outright — the project list, a git read, the
		// suggestion query. The cycle stands and the suggestions stay pending for a person, but the
		// failure is recorded on the cycle rather than only logged: "nothing launched" and "the
		// launcher never got to ask" are different answers, and an operator cannot act on the
		// second one if it looks exactly like auto-launch being switched off.
		webLogger.warn({ cycleId, err }, 'Director suggestion auto-launch failed');
		return {
			error: err instanceof Error ? err.message : String(err),
			launched: [],
			skipped: [],
		};
	}
}

async function considerAndLaunch(
	deps: SuggestionAutoLaunchDeps,
	cycleId: string,
): Promise<DirectorCycleAutoLaunch> {
	const candidates = await deps.listPending(cycleId);
	// A dismissed suggestion — whether an operator rejected it or the per-cycle retire sweep stood
	// it down — is not pending, so it is already absent here. There is deliberately no branch on
	// `dismissedBy`: both kinds are out for the same reason, and a branch would imply otherwise.
	const skipped: DirectorAutoLaunchSkipped[] = [];
	const eligible: AutoLaunchCandidate[] = [];
	const facts = new ProjectFactsCache(deps);
	const claimedProjects = new Set<string>();

	// The scan decides eligibility and nothing else. The per-cycle ceiling is applied by whichever
	// terminal path runs below, against the count that path can honestly report: a candidate refused
	// here for a quota it never consumed is how the record came to say a cycle had launched its
	// limit when it had launched nothing at all.
	//
	// The cost of that is a dirty-tree read for candidates the ceiling will turn away. It is bounded
	// by the number of distinct projects rather than the number of suggestions, because the cache
	// below answers per project, so it is a handful of `git status` calls in exchange for a quota
	// that means what it says.
	for (const candidate of candidates) {
		const refusal =
			intrinsicRefusal(candidate, deps.config) ??
			projectRefusal(
				candidate,
				await facts.read(candidate.projectId ?? ''),
				deps.dirtyTreeThreshold,
			) ??
			siblingRefusal(candidate, claimedProjects);
		if (refusal) {
			skipped.push(refusal);
			continue;
		}
		eligible.push(candidate);
		// Claimed the moment it becomes eligible, not the moment it launches. That is what makes
		// `eligible` hold at most one candidate per project, and therefore what makes it impossible
		// for the launch loop to start two agents in one working tree no matter how its quota
		// arithmetic works out or which of its launches fail.
		if (candidate.projectId !== null) claimedProjects.add(candidate.projectId);
	}

	if (eligible.length === 0) return { launched: [], skipped };
	return await launchEligible(deps, cycleId, candidates, eligible, skipped);
}

async function launchEligible(
	deps: SuggestionAutoLaunchDeps,
	cycleId: string,
	candidates: AutoLaunchCandidate[],
	eligible: AutoLaunchCandidate[],
	skipped: DirectorAutoLaunchSkipped[],
): Promise<DirectorCycleAutoLaunch> {
	const launched: DirectorCycleAutoLaunch['launched'] = [];
	for (const candidate of eligible) {
		// Counted against launches that actually happened rather than candidates considered. A
		// candidate whose claim was lost, or whose launch threw, never occupied one of this cycle's
		// places, so the next one in rank order gets it instead of being told the cycle had already
		// launched its limit while nothing was running.
		const quota = quotaRefusal(candidate, launched.length, deps.config.maxPerCycle);
		if (quota) {
			skipped.push(quota);
			continue;
		}
		try {
			const result = await deps.launch(candidate.id);
			// A session counts as one of this cycle's places, exactly like a run. That is the whole
			// of "maxPerCycle counts sessions": the ceiling is measured against `launched`, and a
			// recipe that started puts one entry in it however many steps it goes on to run.
			launched.push(
				result.kind === 'run'
					? {
							kind: 'run',
							runId: result.runId,
							suggestionId: candidate.id,
							title: candidate.title,
						}
					: {
							kind: 'pipeline',
							pipelineSessionId: result.pipelineSessionId,
							suggestionId: candidate.id,
							title: candidate.title,
						},
			);
			webLogger.info(
				{
					cycleId,
					started: result.kind === 'run' ? result.runId : result.pipelineSessionId,
					suggestionId: candidate.id,
				},
				'Director auto-launched a suggestion',
			);
		} catch (err) {
			// A lost claim means somebody launched or dismissed it in the seconds since the read.
			// That is the concurrency guard working, not a fault, so it is recorded and not logged
			// as one.
			const lost = err instanceof SuggestionClaimLostError;
			if (!lost) {
				webLogger.warn({ cycleId, err, suggestionId: candidate.id }, 'Auto-launch failed');
			}
			skipped.push(
				lost
					? refusalFor(
							candidate,
							'claim_lost',
							'It stopped being pending before it started.',
						)
					: refusalFor(candidate, 'launch_failed', `The launch failed: ${String(err)}`),
			);
		}
	}
	return { launched, skipped: reorder(skipped, candidates) };
}

function refusalFor(
	candidate: AutoLaunchCandidate,
	code: DirectorAutoLaunchSkipped['code'],
	reason: string,
): DirectorAutoLaunchSkipped {
	return { code, reason, suggestionId: candidate.id, title: candidate.title };
}

// Refusals decided during the launch loop are appended after those decided during the scan, which
// would show an operator a list out of the order the Director itself ranked. Restoring the read
// order costs one pass and makes the record read top-down like the suggestion list beside it.
function reorder(
	skipped: DirectorAutoLaunchSkipped[],
	candidates: AutoLaunchCandidate[],
): DirectorAutoLaunchSkipped[] {
	const position = new Map(candidates.map((candidate, index) => [candidate.id, index]));
	return [...skipped].sort(
		(left, right) =>
			(position.get(left.suggestionId) ?? 0) - (position.get(right.suggestionId) ?? 0),
	);
}
