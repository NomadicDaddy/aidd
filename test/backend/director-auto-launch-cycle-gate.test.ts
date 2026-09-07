import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../backend/src/db/client.ts';
import type { WebSocketMessage } from '../../backend/src/types.ts';
import type { SuggestionAutoLaunchDeps } from '../../backend/src/services/director/suggestionAutoLaunch.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { directorCycles } from '../../backend/src/db/schema.ts';
import { toCycleRecord } from '../../backend/src/services/director/cyclePersistence.ts';
import { runCycleAutoLaunch } from '../../backend/src/services/director/suggestionAutoLaunch.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';

/**
 * The gate above the launcher: whether a finished cycle may auto-launch anything at all.
 *
 * `director-suggestion-auto-launch.test.ts` covers the bounds against a stubbed
 * launcher. What is asserted here lives entirely in the wrapper and is invisible from below:
 *
 *   - a cycle a person ran never auto-launches, and the answer is taken from the cycle's own row
 *     rather than a parameter — `reconcileStaleCycles` re-enters this path after a restart with no
 *     caller left who remembers who started the cycle;
 *   - what happened is written where a person can read it, and announced;
 *   - a cycle the launcher never considered stores NULL, which is the only thing that keeps
 *     "not considered" and "considered and launched nothing" distinguishable afterwards.
 *
 * Against a real database, because the initiator and the status are columns: a stub that answers
 * whatever the test wants would assert nothing about them being read.
 */

interface Harness {
	/** Cycle ids the launcher was actually consulted for. Its whole job here is to not be. */
	asked: string[];
	db: WebDatabase;
	hub: WebSocketHub;
	sent: WebSocketMessage[];
	sqlite: Database;
}

function harness(): Harness {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const hub = new WebSocketHub();
	const sent: WebSocketMessage[] = [];
	hub.broadcast = (message: WebSocketMessage): void => {
		sent.push(message);
	};
	return { asked: [], db: wrapWebDatabase(sqlite).db, hub, sent, sqlite };
}

async function seedCycle(
	db: WebDatabase,
	row: { id: string; initiator: null | string; status: string },
): Promise<void> {
	await db.insert(directorCycles).values({
		completedAt: Date.now(),
		id: row.id,
		initiator: row.initiator,
		startedAt: Date.now() - 1000,
		status: row.status,
		totalSuggestions: 2,
	});
}

async function readAutoLaunch(db: WebDatabase, cycleId: string): Promise<null | string> {
	const rows = await db
		.select({ autoLaunch: directorCycles.autoLaunch })
		.from(directorCycles)
		.where(eq(directorCycles.id, cycleId));
	return rows[0]?.autoLaunch ?? null;
}

/**
 * A launcher whose collaborators all succeed, so anything the gate lets through launches. Overrides
 * let one test at a time make a single collaborator fail or a single bound bite.
 */
function stubDeps(overrides: Partial<SuggestionAutoLaunchDeps> = {}): SuggestionAutoLaunchDeps {
	return {
		config: {
			allowedRecipes: [],
			enabled: true,
			maxPerCycle: 2,
			maxRank: 5,
			riskCeiling: 'LOW',
		},
		dirtyTreeThreshold: 50,
		hasActiveWorkForProject: async () => false,
		launch: async (suggestionId) => ({ kind: 'run', runId: `run_${suggestionId}` }),
		listPending: async () => [
			{
				id: 'sug_1',
				projectId: 'sample-project',
				rank: 1,
				riskLevel: 'LOW',
				suggestedRecipe: null,
				title: 'Fix the thing',
			},
		],
		readDirtyFileCount: async () => 0,
		resolveProjectPaths: async () => new Map([['sample-project', '/tmp/sample-project']]),
		...overrides,
	};
}

/** Wires the harness to a launcher, recording that the launcher was reached at all. */
function runFor(h: Harness, cycleId: string, overrides?: Partial<SuggestionAutoLaunchDeps>) {
	return runCycleAutoLaunch(
		{
			db: h.db,
			hub: h.hub,
			resolveDeps: () => {
				h.asked.push(cycleId);
				return stubDeps(overrides);
			},
		},
		cycleId,
	);
}

describe('a cycle only auto-launches when its own row says it may', () => {
	test('a completed automatic cycle launches, and the record is stored and announced', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'cyc_auto', initiator: 'automatic', status: 'completed' });

			await runFor(h, 'cyc_auto');

			expect(h.asked).toEqual(['cyc_auto']);
			const stored = JSON.parse(
				(await readAutoLaunch(h.db, 'cyc_auto')) ?? 'null',
			) as unknown;
			expect(stored).toEqual({
				launched: [
					{
						kind: 'run',
						runId: 'run_sug_1',
						suggestionId: 'sug_1',
						title: 'Fix the thing',
					},
				],
				skipped: [],
			});
			// Announced so Recent Cycles picks the record up without waiting for a poll, and as the
			// same cycle in the same terminal state: only what it started afterwards is new.
			expect(h.sent).toEqual([
				{
					payload: { cycleId: 'cyc_auto', stage: 'completed', status: 'completed' },
					type: 'director_cycle',
				},
			]);
		} finally {
			h.sqlite.close();
		}
	});

	test('a cycle a person ran is never considered, and stores nothing', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'cyc_manual', initiator: 'operator', status: 'completed' });

			await runFor(h, 'cyc_manual');

			// Not "asked and refused" — never asked. Somebody who pressed Run cycle is already
			// sitting in front of the results; there is nothing to do on their behalf.
			expect(h.asked).toEqual([]);
			expect(await readAutoLaunch(h.db, 'cyc_manual')).toBeNull();
			expect(h.sent).toEqual([]);
		} finally {
			h.sqlite.close();
		}
	});

	test('a cycle with no recorded initiator is never considered', async () => {
		const h = harness();
		try {
			// Every row written before the initiator column existed. Unknown provenance is not a
			// authority to act; the automatic path has to say so in the row.
			await seedCycle(h.db, { id: 'cyc_legacy', initiator: null, status: 'completed' });

			await runFor(h, 'cyc_legacy');

			expect(h.asked).toEqual([]);
			expect(await readAutoLaunch(h.db, 'cyc_legacy')).toBeNull();
		} finally {
			h.sqlite.close();
		}
	});

	test('a failed automatic cycle is never considered', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'cyc_failed', initiator: 'automatic', status: 'failed' });

			await runFor(h, 'cyc_failed');

			// A failed cycle persisted no suggestions, and its ranks were never stamped.
			expect(h.asked).toEqual([]);
			expect(await readAutoLaunch(h.db, 'cyc_failed')).toBeNull();
		} finally {
			h.sqlite.close();
		}
	});

	test('a cycle still running is never considered', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'cyc_running', initiator: 'automatic', status: 'running' });

			await runFor(h, 'cyc_running');

			expect(h.asked).toEqual([]);
			expect(await readAutoLaunch(h.db, 'cyc_running')).toBeNull();
		} finally {
			h.sqlite.close();
		}
	});

	test('a cycle that no longer exists is a no-op rather than a throw', async () => {
		const h = harness();
		try {
			await runFor(h, 'cyc_missing');
			expect(h.asked).toEqual([]);
			expect(h.sent).toEqual([]);
		} finally {
			h.sqlite.close();
		}
	});
});

describe('what the stored record means', () => {
	test('auto-launch switched off writes nothing, so NULL keeps meaning "not considered"', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'cyc_off', initiator: 'automatic', status: 'completed' });

			await runFor(h, 'cyc_off', {
				config: {
					allowedRecipes: [],
					enabled: false,
					maxPerCycle: 2,
					maxRank: 5,
					riskCeiling: 'LOW',
				},
			});

			// The launcher was consulted and declined to act, but an operator who turned it off
			// does not need telling — and an empty record on the row would read as a bound biting.
			expect(h.asked).toEqual(['cyc_off']);
			expect(await readAutoLaunch(h.db, 'cyc_off')).toBeNull();
			expect(h.sent).toEqual([]);
		} finally {
			h.sqlite.close();
		}
	});

	test('a bound that bites is recorded, not silently equivalent to nothing happening', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, { id: 'cyc_bound', initiator: 'automatic', status: 'completed' });

			await runFor(h, 'cyc_bound', {
				config: {
					allowedRecipes: [],
					enabled: true,
					maxPerCycle: 2,
					maxRank: 5,
					riskCeiling: 'LOW',
				},
				listPending: async () => [
					{
						id: 'sug_risky',
						projectId: 'sample-project',
						rank: 1,
						riskLevel: 'HIGH',
						suggestedRecipe: null,
						title: 'Rewrite the auth layer',
					},
				],
			});

			const stored = JSON.parse((await readAutoLaunch(h.db, 'cyc_bound')) ?? 'null') as {
				launched: unknown[];
				skipped: unknown[];
			};
			expect(stored.launched).toEqual([]);
			expect(stored.skipped).toEqual([
				{
					code: 'risk_above_ceiling',
					reason: expect.any(String),
					suggestionId: 'sug_risky',
					title: 'Rewrite the auth layer',
				},
			]);
		} finally {
			h.sqlite.close();
		}
	});

	test('a launcher that fails outright records the failure instead of losing it', async () => {
		const h = harness();
		try {
			await seedCycle(h.db, {
				id: 'cyc_broken',
				initiator: 'automatic',
				status: 'completed',
			});

			await runFor(h, 'cyc_broken', {
				listPending: async () => {
					throw new Error('the suggestion query failed');
				},
			});

			// Without this the row is indistinguishable from auto-launch being switched off, and an
			// operator who turned it on and saw nothing happen has no way to tell a bound doing its
			// job from the launcher never getting to ask.
			const stored = JSON.parse((await readAutoLaunch(h.db, 'cyc_broken')) ?? 'null') as {
				error?: string;
				launched: unknown[];
				skipped: unknown[];
			};
			expect(stored.error).toContain('the suggestion query failed');
			expect(stored.launched).toEqual([]);
			expect(stored.skipped).toEqual([]);
		} finally {
			h.sqlite.close();
		}
	});

	test('a write that fails never propagates back into the completed cycle', async () => {
		const h = harness();
		// The cycle and its suggestions were committed before this hook fired. Failing to record
		// what happened next must not turn a good cycle into a thrown error at its call site.
		h.sqlite.close();

		await runFor(h, 'cyc_gone');
	});
});

describe('a stored record older than recipe auto-launch still reads correctly', () => {
	function readBack(autoLaunch: string): unknown {
		return toCycleRecord(
			{
				autoLaunch,
				completedAt: 2,
				fleetHealthScore: null,
				id: 'cyc_old',
				startedAt: 1,
				status: 'completed',
				totalSuggestions: 1,
			},
			() => ({ web: { dataDir: 'D:/apps/data' } }) as never,
			new Map(),
		).autoLaunch;
	}

	test('a launch record without a discriminant narrows to a run', () => {
		// No migration: the column holds one JSON document written by whichever build was running
		// at the time, and rewriting a cycle's history to add a discriminant would edit the record
		// of what happened. It is narrowed on the way out instead.
		expect(
			readBack(
				JSON.stringify({
					launched: [{ runId: 'run_1', suggestionId: 'sug_1', title: 'Fix the thing' }],
					skipped: [],
				}),
			),
		).toEqual({
			launched: [
				{ kind: 'run', runId: 'run_1', suggestionId: 'sug_1', title: 'Fix the thing' },
			],
			skipped: [],
		});
	});

	test('a session written by this build reads back as a session', () => {
		expect(
			readBack(
				JSON.stringify({
					launched: [
						{
							kind: 'pipeline',
							pipelineSessionId: 'pipe_1',
							suggestionId: 'sug_1',
							title: 'Fix the thing',
						},
					],
					skipped: [],
				}),
			),
		).toMatchObject({ launched: [{ kind: 'pipeline', pipelineSessionId: 'pipe_1' }] });
	});
});
