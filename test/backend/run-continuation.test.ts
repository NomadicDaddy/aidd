import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { runs } from '../../backend/src/db/schema.ts';
import {
	buildContinuationLaunchRequest,
	chainDepth,
	continueRun,
	evaluateContinuationValue,
	maybeAutoChainRun,
	readContinuationLedgerEntry,
	type ContinuationRunFacts,
} from '../../backend/src/services/run/continuation.ts';
import { reconcileRunLedgerDrift } from '../../backend/src/services/run/ledgerBackfillSweep.ts';
import { RunControlError } from '../../backend/src/services/run/types.ts';
import type { RunLaunchRequest } from '../../backend/src/types.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
function makeDb() {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrateWebDatabase(sqlite);
	return { sqlite, ...wrapWebDatabase(sqlite) };
}

type SeedInput = {
	backend?: string;
	chainedFromRunId?: null | string;
	continuationReason?: null | string;
	id: string;
	mode?: string;
	model?: null | string;
	pipelineSessionId?: null | string;
	projectPath?: string;
	reasoningEffort?: null | string;
	source?: string;
	startedAt?: number;
	status?: string;
	stopReason?: null | string;
	summary?: null | string;
};

async function seedRun(db: ReturnType<typeof makeDb>['db'], input: SeedInput) {
	await db.insert(runs).values({
		backend: input.backend ?? 'native',
		chainedFromRunId: input.chainedFromRunId ?? null,
		continuationReason: input.continuationReason ?? null,
		id: input.id,
		mode: input.mode ?? 'coding',
		model: input.model ?? null,
		pipelineSessionId: input.pipelineSessionId ?? null,
		projectName: 'proj',
		projectPath: input.projectPath ?? 'd:/applications/proj',
		reasoningEffort: input.reasoningEffort ?? null,
		source: input.source ?? 'web',
		startedAt: input.startedAt ?? Date.now(),
		status: input.status ?? 'failed',
		stopReason: input.stopReason ?? null,
		summary: input.summary ?? null,
	});
	const row = (await db.select().from(runs)).find((candidate) => candidate.id === input.id);
	if (!row) throw new Error(`seed failed: ${input.id}`);
	return row;
}

const WALL_CLOCK_SUMMARY =
	'feature X incomplete; wall_clock_timeout: run exceeded the 3h wall-clock budget (timeoutSeconds=10800)';

function facts(overrides: Partial<ContinuationRunFacts> = {}): ContinuationRunFacts {
	return {
		mode: 'coding',
		pipelineSessionId: null,
		status: 'failed',
		stopReason: 'exit_error',
		summary: WALL_CLOCK_SUMMARY,
		...overrides,
	};
}

describe('evaluateContinuationValue', () => {
	test('wall-clock marker with remaining selected features is eligible', () => {
		const entry = {
			completedFeatures: ['a'],
			durationMs: null,
			exitCode: 124,
			phase: 'coding',
			selectedFeatures: ['a', 'b'],
			stopReason: 'exit_error',
			summary: WALL_CLOCK_SUMMARY,
		};
		expect(evaluateContinuationValue(facts(), entry)).toBe('wall_clock_timeout');
	});

	test('wall-clock marker with every selected feature completed is not eligible', () => {
		const entry = {
			completedFeatures: ['a', 'b'],
			durationMs: null,
			exitCode: 124,
			phase: 'coding',
			selectedFeatures: ['a', 'b'],
			stopReason: 'exit_error',
			summary: WALL_CLOCK_SUMMARY,
		};
		expect(evaluateContinuationValue(facts(), entry)).toBe('none');
	});

	test('wall-clock marker without a ledger entry defers to the marker', () => {
		expect(evaluateContinuationValue(facts(), undefined)).toBe('wall_clock_timeout');
	});

	test('merge-parked worktree runs are excluded despite the marker in the summary', () => {
		expect(
			evaluateContinuationValue(facts({ stopReason: 'merge_conflict_parked' }), undefined)
		).toBe('none');
	});

	test('initializer completion is eligible', () => {
		const entry = {
			completedFeatures: null,
			durationMs: null,
			exitCode: 0,
			phase: 'initializer',
			selectedFeatures: null,
			stopReason: 'completed',
			summary: 'initializer done',
		};
		expect(
			evaluateContinuationValue(
				facts({ status: 'completed', stopReason: 'completed', summary: null }),
				entry
			)
		).toBe('initializer_handoff');
	});

	test('a failed initializer run is not eligible', () => {
		const entry = {
			completedFeatures: null,
			durationMs: null,
			exitCode: 1,
			phase: 'initializer',
			selectedFeatures: null,
			stopReason: 'exit_error',
			summary: 'boom',
		};
		expect(
			evaluateContinuationValue(
				facts({ status: 'failed', stopReason: 'exit_error', summary: 'boom' }),
				entry
			)
		).toBe('none');
	});

	test('non-coding modes and pipeline-owned runs are never eligible', () => {
		expect(evaluateContinuationValue(facts({ mode: 'audit' }), undefined)).toBe('none');
		expect(evaluateContinuationValue(facts({ pipelineSessionId: 'ps_1' }), undefined)).toBe(
			'none'
		);
	});
});

describe('readContinuationLedgerEntry', () => {
	test('surfaces phase and feature arrays from the ledger line', async () => {
		const projectDir = await testTempDir('aidd-continuation-ledger-');
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			const line = JSON.stringify({
				completedFeatures: ['a'],
				exitCode: 124,
				phase: 'coding',
				runId: 'run_x',
				selectedFeatures: ['a', 'b'],
				stopReason: 'exit_error',
				summary: WALL_CLOCK_SUMMARY,
			});
			await writeFile(join(projectDir, '.aidd', 'runs.jsonl'), `${line}\n`);
			const entry = await readContinuationLedgerEntry(projectDir, 'run_x');
			expect(entry?.phase).toBe('coding');
			expect(entry?.selectedFeatures).toEqual(['a', 'b']);
			expect(entry?.completedFeatures).toEqual(['a']);
		} finally {
			await removeTempTree(projectDir);
		}
	});
});

describe('buildContinuationLaunchRequest', () => {
	test('repeats the recorded launch target and links the chain', () => {
		const request = buildContinuationLaunchRequest({
			backend: 'claude-code',
			id: 'run_parent',
			model: 'claude-fable-5',
			projectPath: 'd:/applications/proj',
			reasoningEffort: 'high',
		});
		expect(request).toEqual({
			backend: 'claude-code',
			chainedFromRunId: 'run_parent',
			mode: 'coding',
			model: 'claude-fable-5',
			projectDir: 'd:/applications/proj',
			reasoningEffort: 'high',
		});
	});

	test('omits model and effort when the original run recorded none', () => {
		const request = buildContinuationLaunchRequest({
			backend: 'native',
			id: 'run_parent',
			model: null,
			projectPath: 'd:/applications/proj',
			reasoningEffort: null,
		});
		expect('model' in request).toBe(false);
		expect('reasoningEffort' in request).toBe(false);
	});
});

describe('chainDepth', () => {
	test('counts ancestors through chained_from links and survives cycles', async () => {
		const { db, sqlite } = makeDb();
		try {
			await seedRun(db, { id: 'run_1', status: 'failed' });
			await seedRun(db, { chainedFromRunId: 'run_1', id: 'run_2', status: 'failed' });
			const child = await seedRun(db, {
				chainedFromRunId: 'run_2',
				id: 'run_3',
				status: 'failed',
			});
			expect(await chainDepth(db, { chainedFromRunId: null })).toBe(0);
			expect(await chainDepth(db, child)).toBe(2);
			// Corrupt the chain into a cycle (run_3 -> run_2 -> run_1 -> run_3); the walk must
			// terminate. Only one row is rewritten — the unique chain-link index forbids two rows
			// pointing at the same parent.
			await db.update(runs).set({ chainedFromRunId: 'run_3' }).where(eq(runs.id, 'run_1'));
			expect(await chainDepth(db, { chainedFromRunId: 'run_3' })).toBeLessThanOrEqual(32);
		} finally {
			sqlite.close();
		}
	});
});

function fakeLaunch(db: ReturnType<typeof makeDb>['db'], calls: RunLaunchRequest[]) {
	return async (input: RunLaunchRequest) => {
		calls.push(input);
		return seedRun(db, {
			chainedFromRunId: input.chainedFromRunId ?? null,
			id: `follow_up_${calls.length}`,
			status: 'running',
		});
	};
}

describe('continueRun', () => {
	test('launches a follow-up under the recorded launch target and records telemetry', async () => {
		const { db, sqlite } = makeDb();
		const calls: RunLaunchRequest[] = [];
		const started: string[] = [];
		try {
			await seedRun(db, {
				backend: 'claude-code',
				continuationReason: 'wall_clock_timeout',
				id: 'run_parent',
				model: 'claude-fable-5',
				status: 'failed',
				stopReason: 'exit_error',
				summary: WALL_CLOCK_SUMMARY,
			});
			const launched = await continueRun(
				{
					db,
					launch: fakeLaunch(db, calls),
					recordStart: async (run) => {
						started.push(run.id);
					},
				},
				'run_parent'
			);
			expect(calls).toHaveLength(1);
			expect(calls[0]?.chainedFromRunId).toBe('run_parent');
			expect(calls[0]?.backend).toBe('claude-code');
			expect(calls[0]?.model).toBe('claude-fable-5');
			expect(calls[0]?.mode).toBe('coding');
			expect(started).toEqual([launched.id]);
		} finally {
			sqlite.close();
		}
	});

	test('rejects unknown, active, ineligible, and already-continued runs', async () => {
		const { db, sqlite } = makeDb();
		const calls: RunLaunchRequest[] = [];
		const deps = { db, launch: fakeLaunch(db, calls), recordStart: async () => {} };
		try {
			await expect(continueRun(deps, 'run_missing')).rejects.toBeInstanceOf(RunControlError);

			await seedRun(db, {
				continuationReason: 'wall_clock_timeout',
				id: 'run_live',
				status: 'running',
			});
			await expect(continueRun(deps, 'run_live')).rejects.toBeInstanceOf(RunControlError);

			await seedRun(db, { continuationReason: 'none', id: 'run_plain', status: 'completed' });
			await expect(continueRun(deps, 'run_plain')).rejects.toBeInstanceOf(RunControlError);

			await seedRun(db, {
				continuationReason: 'wall_clock_timeout',
				id: 'run_chained',
				status: 'failed',
			});
			await seedRun(db, {
				chainedFromRunId: 'run_chained',
				id: 'run_chained_child',
				status: 'running',
			});
			await expect(continueRun(deps, 'run_chained')).rejects.toBeInstanceOf(RunControlError);
			expect(calls).toHaveLength(0);
		} finally {
			sqlite.close();
		}
	});

	test('concurrent continue requests cannot both spawn a follow-up', async () => {
		const { db, sqlite } = makeDb();
		try {
			await seedRun(db, {
				continuationReason: 'wall_clock_timeout',
				id: 'run_race',
				status: 'failed',
				stopReason: 'exit_error',
				summary: WALL_CLOCK_SUMMARY,
			});
			// Hold both callers inside launch() so each passes the findFollowUpRunId check
			// before either inserts — the exact interleaving of the reported race.
			let release = () => {};
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			let launches = 0;
			const deps = {
				db,
				launch: async (input: RunLaunchRequest) => {
					launches++;
					const child = `race_child_${launches}`;
					await gate;
					return seedRun(db, {
						chainedFromRunId: input.chainedFromRunId ?? null,
						id: child,
						status: 'running',
					});
				},
				recordStart: async () => {},
			};
			const attempts = [continueRun(deps, 'run_race'), continueRun(deps, 'run_race')];
			release();
			const results = await Promise.allSettled(attempts);
			expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
			const children = (await db.select().from(runs)).filter(
				(row) => row.chainedFromRunId === 'run_race'
			);
			expect(children).toHaveLength(1);
		} finally {
			sqlite.close();
		}
	});

	test('evaluates NULL-reason rows on demand from the ledger', async () => {
		const projectDir = await testTempDir('aidd-continuation-ondemand-');
		const { db, sqlite } = makeDb();
		const calls: RunLaunchRequest[] = [];
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			const line = JSON.stringify({
				completedFeatures: [],
				phase: 'coding',
				runId: 'run_legacy',
				selectedFeatures: ['a'],
			});
			await writeFile(join(projectDir, '.aidd', 'runs.jsonl'), `${line}\n`);
			await seedRun(db, {
				continuationReason: null,
				id: 'run_legacy',
				projectPath: projectDir,
				status: 'failed',
				stopReason: 'exit_error',
				summary: WALL_CLOCK_SUMMARY,
			});
			await continueRun(
				{ db, launch: fakeLaunch(db, calls), recordStart: async () => {} },
				'run_legacy'
			);
			expect(calls).toHaveLength(1);
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});
});

describe('maybeAutoChainRun', () => {
	function autoDeps(
		db: ReturnType<typeof makeDb>['db'],
		calls: RunLaunchRequest[],
		overrides: Partial<{ autoChainLimit: number; autoChainRuns: boolean }> = {}
	) {
		return {
			autoChainLimit: overrides.autoChainLimit ?? 3,
			autoChainRuns: overrides.autoChainRuns ?? true,
			db,
			launch: fakeLaunch(db, calls),
			recordStart: async () => {},
		};
	}

	test('launches a linked follow-up when opted in', async () => {
		const { db, sqlite } = makeDb();
		const calls: RunLaunchRequest[] = [];
		try {
			await seedRun(db, { id: 'run_auto', status: 'failed' });
			await maybeAutoChainRun(autoDeps(db, calls), 'run_auto', 'wall_clock_timeout');
			expect(calls).toHaveLength(1);
			expect(calls[0]?.chainedFromRunId).toBe('run_auto');
		} finally {
			sqlite.close();
		}
	});

	test('stays silent when opted out, for CLI-sourced rows, and past the chain limit', async () => {
		const { db, sqlite } = makeDb();
		const calls: RunLaunchRequest[] = [];
		try {
			await seedRun(db, { id: 'run_optout', status: 'failed' });
			await maybeAutoChainRun(
				autoDeps(db, calls, { autoChainRuns: false }),
				'run_optout',
				'wall_clock_timeout'
			);

			await seedRun(db, { id: 'run_cli', source: 'cli', status: 'failed' });
			await maybeAutoChainRun(autoDeps(db, calls), 'run_cli', 'wall_clock_timeout');

			await seedRun(db, { id: 'chain_0', status: 'failed' });
			await seedRun(db, { chainedFromRunId: 'chain_0', id: 'chain_1', status: 'failed' });
			await maybeAutoChainRun(
				autoDeps(db, calls, { autoChainLimit: 1 }),
				'chain_1',
				'wall_clock_timeout'
			);
			expect(calls).toHaveLength(0);
		} finally {
			sqlite.close();
		}
	});

	test('never auto-chains an initializer handoff', async () => {
		const { db, sqlite } = makeDb();
		const calls: RunLaunchRequest[] = [];
		try {
			await seedRun(db, { id: 'run_blueprint', status: 'completed' });
			await maybeAutoChainRun(autoDeps(db, calls), 'run_blueprint', 'initializer_handoff');
			expect(calls).toHaveLength(0);
		} finally {
			sqlite.close();
		}
	});

	test('never throws when the launch fails (ceiling or transient error)', async () => {
		const { db, sqlite } = makeDb();
		try {
			await seedRun(db, { id: 'run_fail', status: 'failed' });
			await maybeAutoChainRun(
				{
					autoChainLimit: 3,
					autoChainRuns: true,
					db,
					launch: async () => {
						throw new Error('Maximum concurrent runs reached');
					},
					recordStart: async () => {},
				},
				'run_fail',
				'wall_clock_timeout'
			);
		} finally {
			sqlite.close();
		}
	});
});

describe('reconcileRunLedgerDrift continuation backfill', () => {
	test('backfills NULL continuation_reason for eligible and ineligible rows', async () => {
		const projectDir = await testTempDir('aidd-continuation-backfill-');
		const { db, sqlite } = makeDb();
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			const lines = [
				JSON.stringify({
					completedFeatures: [],
					exitCode: 124,
					phase: 'coding',
					runId: 'run_timeout',
					selectedFeatures: ['a'],
					stopReason: 'exit_error',
					summary: WALL_CLOCK_SUMMARY,
				}),
				JSON.stringify({
					exitCode: 0,
					phase: 'coding',
					runId: 'run_ok',
					stopReason: 'completed',
					summary: 'done',
				}),
			];
			await writeFile(join(projectDir, '.aidd', 'runs.jsonl'), `${lines.join('\n')}\n`);
			await seedRun(db, {
				id: 'run_timeout',
				projectPath: projectDir,
				status: 'failed',
				stopReason: 'exit_error',
				summary: WALL_CLOCK_SUMMARY,
			});
			await seedRun(db, {
				id: 'run_ok',
				projectPath: projectDir,
				status: 'completed',
				stopReason: 'completed',
				summary: 'done',
			});
			// Already-evaluated rows must not be recomputed.
			await seedRun(db, {
				continuationReason: 'initializer_handoff',
				id: 'run_kept',
				projectPath: projectDir,
				status: 'completed',
				stopReason: 'completed',
				summary: 'init done',
			});

			const updated = await reconcileRunLedgerDrift(db);
			expect(updated).toBeGreaterThanOrEqual(2);
			const rows = await db.select().from(runs);
			const byId = new Map(rows.map((row) => [row.id, row]));
			expect(byId.get('run_timeout')?.continuationReason).toBe('wall_clock_timeout');
			expect(byId.get('run_ok')?.continuationReason).toBe('none');
			expect(byId.get('run_kept')?.continuationReason).toBe('initializer_handoff');
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});

	test('evaluates NULL continuation for rows older than the field-repair window', async () => {
		const projectDir = await testTempDir('aidd-continuation-old-');
		const { db, sqlite } = makeDb();
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			const line = JSON.stringify({
				completedFeatures: [],
				exitCode: 124,
				phase: 'coding',
				runId: 'run_ancient',
				selectedFeatures: ['a'],
				stopReason: 'exit_error',
				summary: WALL_CLOCK_SUMMARY,
			});
			await writeFile(join(projectDir, '.aidd', 'runs.jsonl'), `${line}\n`);
			// Terminalized long before the continuation column existed — outside any 7-day window.
			await seedRun(db, {
				id: 'run_ancient',
				projectPath: projectDir,
				startedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
				status: 'failed',
				stopReason: 'exit_error',
				summary: WALL_CLOCK_SUMMARY,
			});

			expect(await reconcileRunLedgerDrift(db)).toBe(1);
			const rows = await db.select().from(runs);
			expect(rows[0]?.continuationReason).toBe('wall_clock_timeout');
			// One-time by construction: the row leaves the candidate set once evaluated.
			expect(await reconcileRunLedgerDrift(db)).toBe(0);
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});

	test('evaluates ledgerless projects from row facts alone', async () => {
		const projectDir = await testTempDir('aidd-continuation-noledger-');
		const { db, sqlite } = makeDb();
		try {
			// No .aidd/runs.jsonl at all — the previous sweep skipped such projects forever.
			await seedRun(db, {
				id: 'run_noledger',
				projectPath: projectDir,
				status: 'failed',
				stopReason: 'exit_error',
				summary: WALL_CLOCK_SUMMARY,
			});
			await seedRun(db, {
				id: 'run_noledger_plain',
				projectPath: projectDir,
				status: 'completed',
				stopReason: 'completed',
				summary: 'done',
			});

			expect(await reconcileRunLedgerDrift(db)).toBe(2);
			const rows = await db.select().from(runs);
			const byId = new Map(rows.map((row) => [row.id, row]));
			expect(byId.get('run_noledger')?.continuationReason).toBe('wall_clock_timeout');
			expect(byId.get('run_noledger_plain')?.continuationReason).toBe('none');
		} finally {
			sqlite.close();
			await removeTempTree(projectDir);
		}
	});
});
