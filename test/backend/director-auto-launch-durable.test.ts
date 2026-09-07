import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebDatabase } from '../../backend/src/db/client.ts';
import type { DbCommands } from '../../backend/src/db/commands/types.ts';
import type { ReconcileStaleCyclesContext } from '../../backend/src/services/director/cycleReconcile.ts';
import type { CycleExecutorDeps } from '../../backend/src/services/director/cycleExecutor.ts';
import type { SuggestionAutoLaunchDeps } from '../../backend/src/services/director/suggestionAutoLaunch.ts';
import type { DirectorConfig } from '../../backend/src/services/director/types.ts';
import type { WebSocketHub } from '../../backend/src/webSocketHub.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { directorCycles, runs } from '../../backend/src/db/schema.ts';
import {
	AUTO_LAUNCH_CLAIM_STALE_MS,
	buildAutoLaunchDecision,
} from '../../backend/src/services/director/autoLaunchDecision.ts';
import { reconcileStaleCycles } from '../../backend/src/services/director/cycleReconcile.ts';
import { runCycleAutoLaunch } from '../../backend/src/services/director/suggestionAutoLaunch.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

/**
 * The auto-launch decision as durable state, required by
 * `.aidd/features/audit-logic-1788076531-completed-automatic-cycles-can-lose-auto-launch-across-restart`.
 *
 * Persisting a cycle's results and considering its suggestions used to be two operations with a gap
 * between them. Anything that ended the process in that gap — a restart, a crash — left a completed
 * automatic cycle whose suggestions nothing would ever look at again, and the record could not tell
 * that apart from a cycle the launcher was never meant to run for: both stored NULL.
 *
 * These tests pin the four properties that replace it: the obligation is committed with the
 * suggestions, a restart resumes exactly the cycles still owed one, a dispatch is a claim so two of
 * them cannot both launch, and the bounds a cycle was judged under are the ones that were in force
 * when it completed.
 *
 * Against a real database throughout: the claim is a compare-and-set in SQL, and a stub that
 * answered whatever the test wanted would assert nothing about it.
 */

interface Harness {
	commands: DbCommands;
	db: WebDatabase;
	/** Suggestion ids the launcher actually started, across every dispatch in the test. */
	launched: string[];
	sqlite: Database;
}

function harness(): Harness {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const { commands, db } = wrapWebDatabase(sqlite);
	return { commands, db, launched: [], sqlite };
}

const silentHub = { broadcast: () => undefined } as unknown as WebSocketHub;

function config(enabled: boolean, maxRank = 5): DirectorConfig {
	return {
		dirtyTreeThreshold: 50,
		director: {
			suggestions: {
				autoLaunch: {
					allowedRecipes: [],
					enabled,
					maxPerCycle: 5,
					maxRank,
					riskCeiling: 'LOW',
				},
			},
		},
	} as unknown as DirectorConfig;
}

/** A launcher whose collaborators all succeed, so anything that claims the cycle launches. */
function stubDeps(harnessRef: Harness, rank = 1): SuggestionAutoLaunchDeps {
	return {
		config: {
			allowedRecipes: [],
			enabled: true,
			maxPerCycle: 5,
			// Deliberately wider than the bounds any cycle below is completed under: a dispatch
			// that reads these instead of the preserved ones is the retroactive-widening bug.
			maxRank: 5,
			riskCeiling: 'LOW',
		},
		dirtyTreeThreshold: 50,
		hasActiveWorkForProject: async () => false,
		launch: async (suggestionId) => {
			harnessRef.launched.push(suggestionId);
			return { kind: 'run', runId: `run_${suggestionId}` };
		},
		listPending: async () => [
			{
				id: 'sug_1',
				projectId: 'sample',
				rank,
				riskLevel: 'LOW',
				suggestedRecipe: null,
				title: 'do the thing',
			},
		],
		readDirtyFileCount: async () => 0,
		resolveProjectPaths: async () => new Map([['sample', '/fleet/sample']]),
	};
}

function dispatch(harnessRef: Harness, rank = 1): (cycleId: string) => Promise<void> {
	return async (cycleId) =>
		await runCycleAutoLaunch(
			{ db: harnessRef.db, hub: silentHub, resolveDeps: () => stubDeps(harnessRef, rank) },
			cycleId,
		);
}

/** The reconciliation context, reduced to what the auto-launch resume pass reaches for. */
function reconcileContext(
	harnessRef: Harness,
	autoLaunchSuggestions: (cycleId: string) => Promise<void>,
): ReconcileStaleCyclesContext {
	return {
		activeStages: new Map(),
		awaitAndPersistCycle: async () => undefined,
		db: harnessRef.db,
		executorDeps: () => ({ autoLaunchSuggestions }) as unknown as CycleExecutorDeps,
		getConfig: () => config(true),
		hub: silentHub,
		setCycleStage: () => undefined,
	};
}

async function seedCycle(
	db: WebDatabase,
	row: { id: string; initiator: null | string; status?: string },
): Promise<void> {
	await db.insert(directorCycles).values({
		id: row.id,
		initiator: row.initiator,
		startedAt: Date.now() - 1000,
		status: row.status ?? 'running',
	});
}

async function readCycle(
	db: WebDatabase,
	cycleId: string,
): Promise<{ autoLaunch: null | string; state: null | string }> {
	const rows = await db
		.select({ autoLaunch: directorCycles.autoLaunch, state: directorCycles.autoLaunchState })
		.from(directorCycles)
		.where(eq(directorCycles.id, cycleId));
	return { autoLaunch: rows[0]?.autoLaunch ?? null, state: rows[0]?.state ?? null };
}

/**
 * Completes a cycle exactly as the persistence layer does, then stops.
 *
 * This is the interruption the whole feature is about: the results are committed and the process
 * never reaches the dispatch that would have followed.
 */
async function completeCycle(
	h: Harness,
	cycleId: string,
	cycleConfig: DirectorConfig = config(true),
): Promise<void> {
	await h.commands.persistCycleResult({
		autoLaunchDecision: buildAutoLaunchDecision(cycleConfig),
		createdAt: Date.now(),
		cycleId,
		cycleUpdate: {
			completedAt: Date.now(),
			failureReason: null,
			fleetHealthScore: 90,
			status: 'completed',
			totalSuggestions: 0,
		},
		dedupWindowMs: 0,
		suggestions: [],
	});
}

describe('the decision is committed with the cycle', () => {
	test('a completed automatic cycle is left owing a dispatch', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'c1', initiator: 'automatic' });
			await completeCycle(h, 'c1');

			const rows = await h.db
				.select({
					bounds: directorCycles.autoLaunchBounds,
					state: directorCycles.autoLaunchState,
				})
				.from(directorCycles)
				.where(eq(directorCycles.id, 'c1'));
			expect(rows[0]?.state).toBe('pending');
			// The bounds travel with the obligation, not with whatever Settings say later.
			expect(JSON.parse(rows[0]?.bounds ?? '{}')).toEqual({
				config: {
					allowedRecipes: [],
					enabled: true,
					maxPerCycle: 5,
					maxRank: 5,
					riskCeiling: 'LOW',
				},
				dirtyTreeThreshold: 50,
			});
		} finally {
			h.sqlite.close();
		}
	});

	test('auto-launch switched off records a decision that is already made', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'c1', initiator: 'automatic' });
			await completeCycle(h, 'c1', config(false));
			expect((await readCycle(h.db, 'c1')).state).toBe('disabled');
		} finally {
			h.sqlite.close();
		}
	});

	test("a person's cycle is owed nothing, whatever the caller passes", async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'c1', initiator: 'operator' });
			await completeCycle(h, 'c1');
			// Established from the row rather than from the argument: the caller asked for pending.
			expect((await readCycle(h.db, 'c1')).state).toBeNull();
		} finally {
			h.sqlite.close();
		}
	});
});

describe('a restart resumes exactly what is owed', () => {
	test('one cycle recovery failure does not strand the cycles after it', async () => {
		const h = harness();
		const dataDir = await testTempDir('aidd-director-reconcile-');
		try {
			await seedCycle(h.db, { id: 'cycle_bad', initiator: 'operator' });
			await seedCycle(h.db, { id: 'cycle_next', initiator: 'operator' });
			await h.db.insert(runs).values({
				backend: 'native',
				id: 'run_bad',
				mode: 'director',
				projectName: 'sample',
				projectPath: '/fleet/sample',
				startedAt: Date.now() - 500,
				status: 'completed',
				directorCycleId: 'cycle_bad',
			});
			const cycleDir = join(dataDir, 'director');
			await mkdir(cycleDir, { recursive: true });
			await Bun.write(
				join(cycleDir, 'cycle_bad-fleet-summary.json'),
				'{"fleetAggregations":{"fleetHealthScore":90}}\n',
			);

			const ctx = reconcileContext(h, async () => undefined);
			ctx.getConfig = () =>
				({ ...config(true), web: { dataDir } }) as unknown as DirectorConfig;
			ctx.executorDeps = () =>
				({
					readCycleOutput: async () => {
						throw new Error('bad output reader');
					},
				}) as unknown as CycleExecutorDeps;

			await reconcileStaleCycles(ctx);

			const rows = await h.db.select().from(directorCycles);
			expect(rows.find((row) => row.id === 'cycle_bad')?.status).toBe('failed');
			expect(rows.find((row) => row.id === 'cycle_next')?.status).toBe('failed');
		} finally {
			h.sqlite.close();
			await removeTempTree(dataDir);
		}
	});

	test('a cycle interrupted after persistence launches once, and only once', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'c1', initiator: 'automatic' });
			await completeCycle(h, 'c1');
			// The process died here: nothing dispatched the cycle it had just persisted.
			expect(h.launched).toEqual([]);

			await reconcileStaleCycles(reconcileContext(h, dispatch(h)));
			expect(h.launched).toEqual(['sug_1']);
			const after = await readCycle(h.db, 'c1');
			expect(after.state).toBe('finalized');
			expect(JSON.parse(after.autoLaunch ?? '{}').launched).toHaveLength(1);

			// A second restart must not launch the same suggestion again.
			await reconcileStaleCycles(reconcileContext(h, dispatch(h)));
			expect(h.launched).toEqual(['sug_1']);
		} finally {
			h.sqlite.close();
		}
	});

	test('an interrupted dispatch is taken over once its claim has gone stale', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'c1', initiator: 'automatic' });
			await completeCycle(h, 'c1');
			// A dispatch that claimed the cycle and died before finalizing it.
			await h.db
				.update(directorCycles)
				.set({
					autoLaunchClaimedAt: Date.now() - AUTO_LAUNCH_CLAIM_STALE_MS - 1000,
					autoLaunchState: 'processing',
				})
				.where(eq(directorCycles.id, 'c1'));

			await reconcileStaleCycles(reconcileContext(h, dispatch(h)));
			expect(h.launched).toEqual(['sug_1']);
			expect((await readCycle(h.db, 'c1')).state).toBe('finalized');
		} finally {
			h.sqlite.close();
		}
	});

	test('a claim taken moments ago belongs to a live dispatch and is left alone', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'c1', initiator: 'automatic' });
			await completeCycle(h, 'c1');
			await h.db
				.update(directorCycles)
				.set({ autoLaunchClaimedAt: Date.now(), autoLaunchState: 'processing' })
				.where(eq(directorCycles.id, 'c1'));

			await reconcileStaleCycles(reconcileContext(h, dispatch(h)));
			expect(h.launched).toEqual([]);
		} finally {
			h.sqlite.close();
		}
	});

	test('finalized, disabled, failed and operator cycles are never replayed', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'finalized', initiator: 'automatic' });
			await completeCycle(h, 'finalized');
			await dispatch(h)('finalized');
			expect(h.launched).toEqual(['sug_1']);

			await seedCycle(h.db, { id: 'disabled', initiator: 'automatic' });
			await completeCycle(h, 'disabled', config(false));
			await seedCycle(h.db, { id: 'operator', initiator: 'operator' });
			await completeCycle(h, 'operator');
			await seedCycle(h.db, { id: 'failed', initiator: 'automatic', status: 'failed' });
			await h.db
				.update(directorCycles)
				.set({ autoLaunchState: 'pending' })
				.where(eq(directorCycles.id, 'failed'));

			await reconcileStaleCycles(reconcileContext(h, dispatch(h)));

			// Still the one launch from the finalized cycle's own dispatch.
			expect(h.launched).toEqual(['sug_1']);
			expect((await readCycle(h.db, 'disabled')).state).toBe('disabled');
			expect((await readCycle(h.db, 'operator')).state).toBeNull();
		} finally {
			h.sqlite.close();
		}
	});
});

describe('the claim is what makes a dispatch idempotent', () => {
	test('two dispatches of one cycle launch it once', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'c1', initiator: 'automatic' });
			await completeCycle(h, 'c1');

			// The post-persistence hook and a reconciliation pass, overlapping.
			await Promise.all([dispatch(h)('c1'), dispatch(h)('c1')]);

			expect(h.launched).toEqual(['sug_1']);
			expect((await readCycle(h.db, 'c1')).state).toBe('finalized');
		} finally {
			h.sqlite.close();
		}
	});

	test('a cycle completed while auto-launch was off cannot be dispatched later', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'c1', initiator: 'automatic' });
			await completeCycle(h, 'c1', config(false));

			// Auto-launch is on again by the time this runs; the cycle's own decision still stands.
			await dispatch(h)('c1');

			expect(h.launched).toEqual([]);
			expect((await readCycle(h.db, 'c1')).state).toBe('disabled');
		} finally {
			h.sqlite.close();
		}
	});
});

describe('the bounds that applied when the cycle completed', () => {
	test('a rank the cycle was too narrow for is not launched by a later, wider setting', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'c1', initiator: 'automatic' });
			// Completed under a cutoff of rank 1.
			await completeCycle(h, 'c1', config(true, 1));

			// Dispatched against live bounds of rank 5, with a rank-3 suggestion.
			await dispatch(h, 3)('c1');

			expect(h.launched).toEqual([]);
			const after = await readCycle(h.db, 'c1');
			expect(after.state).toBe('finalized');
			const outcome = JSON.parse(after.autoLaunch ?? '{}');
			expect(outcome.skipped[0].code).toBe('rank_ineligible');
			// The reason quotes the cutoff the cycle was completed under, not today's.
			expect(outcome.skipped[0].reason).toContain('cutoff of 1');
		} finally {
			h.sqlite.close();
		}
	});
});
