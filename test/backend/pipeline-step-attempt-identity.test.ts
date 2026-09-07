import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { RecipeStepDefinition } from '../../backend/src/types.ts';
import type { RunService } from '../../backend/src/services/runService.ts';
import type { TelemetryService } from '../../backend/src/services/telemetryService.ts';
import type { AutoFixRunner } from '../../backend/src/services/pipeline/autoFixRunner.ts';
import type { HookRunner } from '../../backend/src/services/pipeline/hookRunner.ts';
import type { SessionLifecycle } from '../../backend/src/services/pipeline/sessionLifecycle.ts';
import type { StepDispatcher } from '../../backend/src/services/pipeline/stepDispatcher.ts';
import type {
	ExecutionContext,
	PipelineSessionRow,
	StepDispatchResult,
} from '../../backend/src/services/pipeline/types.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { migrations } from '../../backend/src/db/migrations/registry.ts';
import { pipelineStepResults } from '../../backend/src/db/schema.ts';
import { toStepResultRecord } from '../../backend/src/services/pipeline/recordMappers.ts';
import { deriveResumeResolution } from '../../backend/src/services/pipeline/sessionReconciler.ts';
import {
	completeStepRow,
	insertStepResult,
	markStepRowRunning,
} from '../../backend/src/services/pipeline/stepRowWriter.ts';
import { executeStep } from '../../backend/src/services/pipeline/stepRunner.ts';

const SESSION_ID = 'pipe_attempts';
const PROJECT_PATH = 'd:/applications/example';

/**
 * A database as it stood before 0003: every migration up to (but excluding) the attempt-identity
 * one, applied and recorded the way `migrateWebDatabase` applies them. `sqlite.exec()` abandons the
 * rest of a file after a failed statement without reporting it, so each version is applied from the
 * registry rather than from a hand-rolled DDL dump that could drift from what production runs.
 */
function migrateThroughVersion(sqlite: Database, lastVersion: string): void {
	sqlite.exec(
		'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);',
	);
	for (const migration of migrations) {
		sqlite.exec(migration.sql);
		sqlite.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
			migration.version,
			Date.now(),
		]);
		if (migration.version === lastVersion) return;
	}
	throw new Error(`Unknown migration version: ${lastVersion}`);
}

function seedSession(sqlite: Database): void {
	sqlite.run(
		'INSERT INTO pipeline_sessions (id, parameters_json, project_name, project_path, recipe_id, recipe_name, started_at, status, total_steps, current_step_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
		[SESSION_ID, '{}', 'example', PROJECT_PATH, 'recipe', 'Recipe', 500, 'running', 1, 0],
	);
}

function context(): ExecutionContext {
	return {
		depth: 0,
		displayOrder: 0,
		initiator: 'operator',
		lineage: [],
		parameters: {},
		projectDir: PROJECT_PATH,
		sessionId: SESSION_ID,
	};
}

function stubLifecycle(db: ReturnType<typeof wrapWebDatabase>['db']): SessionLifecycle {
	return {
		completeStep: async (input: {
			completedAt: number;
			errorMessage?: string | undefined;
			resultId: string;
			startedAt: number;
			status: string;
		}) => {
			await db
				.update(pipelineStepResults)
				.set({
					completedAt: input.completedAt,
					errorMessage: input.errorMessage ?? null,
					status: input.status as 'completed',
				})
				.where(eq(pipelineStepResults.id, input.resultId));
		},
		createStepResult: async (input: Parameters<typeof insertStepResult>[1]) =>
			insertStepResult(db, input),
		markStepRunning: async (resultId: string, startedAt: number) =>
			markStepRowRunning(db, resultId, startedAt),
		progress: { publishActive: async () => {} },
		setStepRunId: async () => {},
	} as unknown as SessionLifecycle;
}

describe('pipeline step attempt identity', () => {
	test('adds the attempt columns to a database that predates them and leaves its rows alone', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateThroughVersion(sqlite, '0002_director_auto_launch_decision');
			seedSession(sqlite);
			const columnsBefore = sqlite
				.query<{ name: string }, []>('PRAGMA table_info(pipeline_step_results)')
				.all()
				.map((column) => column.name);
			expect(columnsBefore).not.toContain('attempt_number');
			sqlite.run(
				'INSERT INTO pipeline_step_results (id, session_id, sequence_number, display_order, depth, phase, step_name, step_type, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
				['legacy_row', SESSION_ID, 1, 1, 0, 'step', 'Build', 'shell', 'completed', 700],
			);

			migrateWebDatabase(sqlite);

			const applied = sqlite
				.query<{ version: string }, []>('SELECT version FROM schema_migrations')
				.all()
				.map((row) => row.version);
			expect(applied).toContain('0003_pipeline_step_attempt_identity');
			// The seeded row is what proves the migration altered the table instead of rebuilding
			// it: a recreated table that failed to carry rows across would still pass a column
			// check while losing every step the session had already recorded.
			const legacy = sqlite
				.query<
					{
						attempt_kind: null | string;
						attempt_number: null | number;
						step_name: string;
					},
					[string]
				>(
					'SELECT attempt_kind, attempt_number, step_name FROM pipeline_step_results WHERE id = ?',
				)
				.get('legacy_row');
			expect(legacy?.step_name).toBe('Build');
			expect(legacy?.attempt_number).toBeNull();
			expect(legacy?.attempt_kind).toBeNull();
		} finally {
			sqlite.close();
		}
	});

	test('rejects an attempt ordinal or kind the report could not render', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			seedSession(sqlite);
			const insert = (
				id: string,
				attemptNumber: null | number,
				attemptKind: null | string,
			) => {
				sqlite.run(
					'INSERT INTO pipeline_step_results (id, session_id, sequence_number, display_order, depth, phase, step_name, step_type, status, attempt_number, attempt_kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
					[
						id,
						SESSION_ID,
						1,
						1,
						0,
						'step',
						'Build',
						'shell',
						'queued',
						attemptNumber,
						attemptKind,
					],
				);
			};

			expect(() => insert('zeroth', 0, 'ordinary')).toThrow();
			expect(() => insert('nonsense', 1, 'retry')).toThrow();
			expect(() => insert('valid', 1, 'ordinary')).not.toThrow();
		} finally {
			sqlite.close();
		}
	});

	test('carries the persisted attempt identity through the report mapper unchanged', async () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			seedSession(sqlite);
			const { db } = wrapWebDatabase(sqlite);
			const execution = context();
			const attempt = await insertStepResult(db, {
				attemptKind: 'ordinary',
				attemptNumber: 2,
				context: execution,
				phase: 'step',
				sequenceNumber: 1,
				stepDefinitionId: 'recipe-step-1',
				stepName: 'Build',
				stepType: 'shell',
			});
			const hook = await insertStepResult(db, {
				context: execution,
				parentStepResultId: attempt.id,
				phase: 'post-hook',
				sequenceNumber: 1,
				stepName: 'Build post-hook',
				stepType: 'shell',
			});

			expect(attempt.attemptNumber).toBe(2);
			expect(attempt.attemptKind).toBe('ordinary');
			// A hook is not an attempt at the step it hangs off, and must not read as attempt 1.
			expect(hook.attemptNumber).toBeNull();
			expect(hook.attemptKind).toBeNull();

			const rows = await db
				.select()
				.from(pipelineStepResults)
				.where(eq(pipelineStepResults.id, attempt.id));
			const mapped = toStepResultRecord(rows[0]!);
			expect(mapped.attemptNumber).toBe(2);
			expect(mapped.attemptKind).toBe('ordinary');
		} finally {
			sqlite.close();
		}
	});

	test('persists one row per ordinary attempt when a step fails and then succeeds', async () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			seedSession(sqlite);
			const { db } = wrapWebDatabase(sqlite);
			const execution = context();
			const dispatches: StepDispatchResult[] = [
				{ errorMessage: 'exit 1', exitCode: 1, ok: false },
				{ ok: true, outputSummary: 'done' },
			];
			let dispatched = 0;
			const step: RecipeStepDefinition = {
				configJson: {},
				id: 'recipe-step-1',
				name: 'Build',
				retryCount: 1,
				stepType: 'shell',
			};

			const outcome = await executeStep(
				{
					autoFix: {} as AutoFixRunner,
					dispatcher: {
						dispatch: async () => dispatches[dispatched++]!,
					} as unknown as StepDispatcher,
					hooks: {} as HookRunner,
					lifecycle: stubLifecycle(db),
					stopFlags: new Set<string>(),
				},
				step,
				execution,
				1,
			);

			expect(outcome.ok).toBe(true);
			const rows = await db
				.select()
				.from(pipelineStepResults)
				.orderBy(pipelineStepResults.displayOrder);
			// The provoking failure used to be overwritten by the success that followed it, so the
			// report showed a clean step and no evidence a retry had happened at all.
			expect(
				rows.map((row) => [
					row.attemptNumber,
					row.attemptKind,
					row.status,
					row.errorMessage,
				]),
			).toEqual([
				[1, 'ordinary', 'failed', 'exit 1'],
				[2, 'ordinary', 'completed', null],
			]);
			// Every attempt is terminal: two queued/running rows for one step is the shape the
			// resume reconciler reads as a duplicate execution.
			expect(rows.every((row) => row.completedAt !== null)).toBe(true);
			expect(rows.map((row) => row.sequenceNumber)).toEqual([1, 1]);
		} finally {
			sqlite.close();
		}
	});

	test('records the auto-fix run as the attempt it follows', async () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			seedSession(sqlite);
			const { db } = wrapWebDatabase(sqlite);
			const execution = context();
			const autoFixCalls: number[] = [];
			const step: RecipeStepDefinition = {
				configJson: {},
				id: 'recipe-step-1',
				name: 'Build',
				onFailure: 'auto-fix',
				stepType: 'shell',
			};

			await executeStep(
				{
					autoFix: {
						run: async (input: {
							attemptNumber: number;
							parentStepResultId: string;
						}) => {
							autoFixCalls.push(input.attemptNumber);
							await insertStepResult(db, {
								attemptKind: 'auto-fix',
								attemptNumber: input.attemptNumber,
								context: execution,
								parentStepResultId: input.parentStepResultId,
								phase: 'step',
								sequenceNumber: 1,
								stepDefinitionId: step.id,
								stepName: `${step.name} auto-fix`,
								stepType: 'aidd-cli',
							});
							return true;
						},
					} as unknown as AutoFixRunner,
					dispatcher: {
						dispatch: async () => ({ errorMessage: 'exit 1', ok: false }),
					} as unknown as StepDispatcher,
					hooks: {} as HookRunner,
					lifecycle: stubLifecycle(db),
					stopFlags: new Set<string>(),
				},
				step,
				execution,
				1,
			);

			// The remediation is seated between the two ordinary attempts and parented to the one it
			// followed, so the report can place it without reading the ' auto-fix' name suffix.
			expect(autoFixCalls).toEqual([1]);
			const rows = await db
				.select()
				.from(pipelineStepResults)
				.orderBy(pipelineStepResults.displayOrder);
			expect(rows.map((row) => [row.stepName, row.attemptNumber, row.attemptKind])).toEqual([
				['Build', 1, 'ordinary'],
				['Build auto-fix', 1, 'auto-fix'],
				['Build', 2, 'ordinary'],
			]);
			expect(rows[1]?.parentStepResultId).toBe(rows[0]!.id);
		} finally {
			sqlite.close();
		}
	});
});

describe('pipeline step attempt identity across a restart', () => {
	// A restart mid-retry used to be unambiguous: the step held one row, and that row stayed
	// 'running' for the whole cycle, so the reconciler saw an in-flight step and resumed it.
	// Per-attempt rows remove that signal unless every handover keeps one row in flight, because a
	// terminal 'failed' attempt row is indistinguishable from a step that is genuinely finished --
	// and the reconciler only considers parentless rows, so a running auto-fix child is invisible
	// to it. Both tests below drive the real executeStep and cut it off mid-cycle rather than
	// hand-seeding a shape the runner might stop producing.
	const CRASH = 'simulated web restart';

	function topLevelInFlight(sqlite: Database): number[] {
		return sqlite
			.query<{ sequence_number: number }, []>(
				"SELECT sequence_number FROM pipeline_step_results WHERE parent_step_result_id IS NULL AND phase = 'step' AND status IN ('queued','running')",
			)
			.all()
			.map((row) => row.sequence_number);
	}

	async function resumeResolution(
		db: ReturnType<typeof wrapWebDatabase>['db'],
		sqlite: Database,
	) {
		const session = sqlite
			.query<Record<string, unknown>, [string]>(
				'SELECT * FROM pipeline_sessions WHERE id = ?',
			)
			.get(SESSION_ID);
		return deriveResumeResolution(
			{
				activeSessionIds: () => new Set<string>(),
				db,
				runService: {} as RunService,
				telemetryService: {} as TelemetryService,
			},
			session as unknown as PipelineSessionRow,
		);
	}

	test('resumes the step whose auto-fix was still running, and strands no remediation row', async () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			seedSession(sqlite);
			sqlite.run('UPDATE pipeline_sessions SET total_steps = 2');
			const { db } = wrapWebDatabase(sqlite);
			const execution = context();
			const step: RecipeStepDefinition = {
				configJson: {},
				id: 'recipe-step-1',
				name: 'Build',
				onFailure: 'auto-fix',
				stepType: 'shell',
			};
			let fixRowId = '';

			await expect(
				executeStep(
					{
						autoFix: {
							run: async (input: {
								attemptNumber: number;
								parentStepResultId: string;
							}) => {
								const fix = await insertStepResult(db, {
									attemptKind: 'auto-fix',
									attemptNumber: input.attemptNumber,
									context: execution,
									parentStepResultId: input.parentStepResultId,
									phase: 'step',
									sequenceNumber: 1,
									stepDefinitionId: step.id,
									stepName: 'Build auto-fix',
									stepType: 'aidd-cli',
								});
								fixRowId = fix.id;
								await markStepRowRunning(db, fix.id, Date.now());
								// The web process dies here, remediation still running.
								throw new Error(CRASH);
							},
						} as unknown as AutoFixRunner,
						dispatcher: {
							dispatch: async () => ({ errorMessage: 'exit 1', ok: false }),
						} as unknown as StepDispatcher,
						hooks: {} as HookRunner,
						lifecycle: stubLifecycle(db),
						stopFlags: new Set<string>(),
					},
					step,
					execution,
					1,
				),
			).rejects.toThrow(CRASH);

			const resolution = await resumeResolution(db, sqlite);

			// Resuming at step 2 would skip the retry the recipe promised, and would run the rest
			// of the pipeline alongside an orphaned remediation nothing will ever terminalize.
			expect(resolution.startSequenceNumber).toBe(1);
			expect(resolution.inFlightStep?.sequenceNumber).toBe(1);
			const fixRow = sqlite
				.query<{ status: string }, [string]>(
					'SELECT status FROM pipeline_step_results WHERE id = ?',
				)
				.get(fixRowId);
			expect(fixRow?.status).not.toBe('running');
		} finally {
			sqlite.close();
		}
	});

	test('keeps one in-flight row for the step at every point of a retry handover', async () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			seedSession(sqlite);
			const { db } = wrapWebDatabase(sqlite);
			const execution = context();
			const dispatches: StepDispatchResult[] = [
				{ errorMessage: 'exit 1', exitCode: 1, ok: false },
				{ ok: true, outputSummary: 'done' },
			];
			let dispatched = 0;
			// Every state the database passes through while the step is still owed an attempt. A
			// restart at any of them must resume step 1 rather than move on.
			const observed: number[][] = [];
			const lifecycle = stubLifecycle(db);
			const watched = new Proxy(lifecycle, {
				get(target, property, receiver) {
					const value = Reflect.get(target, property, receiver);
					if (typeof value !== 'function') return value;
					return async (...args: unknown[]) => {
						const result = await (value as (...a: unknown[]) => unknown).apply(
							target,
							args,
						);
						observed.push(topLevelInFlight(sqlite));
						return result;
					};
				},
			});

			const outcome = await executeStep(
				{
					autoFix: {} as AutoFixRunner,
					dispatcher: {
						dispatch: async () => {
							observed.push(topLevelInFlight(sqlite));
							return dispatches[dispatched++]!;
						},
					} as unknown as StepDispatcher,
					hooks: {} as HookRunner,
					lifecycle: watched,
					stopFlags: new Set<string>(),
				},
				{
					configJson: {},
					id: 'recipe-step-1',
					name: 'Build',
					retryCount: 1,
					stepType: 'shell',
				},
				execution,
				1,
			);

			expect(outcome.ok).toBe(true);
			// The last write is the one that legitimately empties the set: the step is done.
			const duringCycle = observed.slice(0, -1);
			expect(duringCycle.length).toBeGreaterThan(3);
			expect(duringCycle.filter((sequences) => !sequences.includes(1))).toEqual([]);
			expect(observed.at(-1)).toEqual([]);
		} finally {
			sqlite.close();
		}
	});

	test('moves past a step whose attempts are all spent', async () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);
			seedSession(sqlite);
			sqlite.run('UPDATE pipeline_sessions SET total_steps = 2');
			const { db } = wrapWebDatabase(sqlite);
			const execution = context();
			for (const attemptNumber of [1, 2]) {
				const row = await insertStepResult(db, {
					attemptKind: 'ordinary',
					attemptNumber,
					context: execution,
					phase: 'step',
					sequenceNumber: 1,
					stepDefinitionId: 'recipe-step-1',
					stepName: 'Build',
					stepType: 'shell',
				});
				await completeStepRow(db, {
					completedAt: 900,
					resultId: row.id,
					startedAt: 700,
					status: attemptNumber === 2 ? 'completed' : 'failed',
				});
			}

			const resolution = await resumeResolution(db, sqlite);

			// The retry is over. Nothing about per-attempt rows may hold the session at step 1.
			expect(resolution.startSequenceNumber).toBe(2);
			expect(resolution.inFlightStep).toBeUndefined();
		} finally {
			sqlite.close();
		}
	});
});
