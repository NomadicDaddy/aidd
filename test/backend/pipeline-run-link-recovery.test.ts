import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { RecipeStepDefinition } from '../../backend/src/types.ts';
import type { RunService } from '../../backend/src/services/runService.ts';
import type { SkillService } from '../../backend/src/services/skillService.ts';
import type { TelemetryService } from '../../backend/src/services/telemetryService.ts';
import type { RunWaiter } from '../../backend/src/services/pipeline/runWaiter.ts';
import type { ExecutionContext, RunRow } from '../../backend/src/services/pipeline/types.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { pipelineSessions, pipelineStepResults, runs } from '../../backend/src/db/schema.ts';
import { ManagedStepHandler } from '../../backend/src/services/pipeline/managedStepHandler.ts';
import { deriveResumeResolution } from '../../backend/src/services/pipeline/sessionReconciler.ts';

const PROJECT_PATH = 'd:/applications/example';

function makeRun(id: string, status: 'completed' | 'running', startedAt: number): RunRow {
	return {
		backend: 'native',
		id,
		mode: 'coding',
		pipelineSessionId: 'pipe_recovery',
		projectName: 'example',
		projectPath: PROJECT_PATH,
		source: 'web',
		startedAt,
		status,
	} as unknown as RunRow;
}

describe('managed pipeline run linkage', () => {
	test('persists the run id before waiting for the managed run to finish', async () => {
		const launchedRun = makeRun('run_linked_early', 'running', 1_000);
		const completedRun = makeRun('run_linked_early', 'completed', 1_000);
		let resolveRun: ((run: RunRow) => void) | undefined;
		const runFinished = new Promise<RunRow>((resolve) => {
			resolveRun = resolve;
		});
		let linkedRunId: string | undefined;
		let markLinked: (() => void) | undefined;
		const linked = new Promise<void>((resolve) => {
			markLinked = resolve;
		});
		const handler = new ManagedStepHandler({
			runService: {
				launchRun: async () => launchedRun,
			} as unknown as RunService,
			runWaiter: {
				agentMessageForRun: async () => 'the step’s closing message',
				outputForRun: async () => 'finished',
				waitForRun: async () => await runFinished,
			} as unknown as RunWaiter,
			skillService: {} as SkillService,
			telemetryService: {} as TelemetryService,
		});
		const step: RecipeStepDefinition = {
			configJson: {},
			id: 'step_1',
			name: 'Managed step',
			stepType: 'aidd-cli',
		};
		const context: ExecutionContext = {
			depth: 0,
			displayOrder: 1,
			initiator: 'operator',
			lineage: ['recipe'],
			parameters: {},
			projectDir: PROJECT_PATH,
			sessionId: 'pipe_recovery',
		};

		const execution = handler.handle(step, step.configJson, context, async (runId) => {
			linkedRunId = runId;
			markLinked?.();
		});
		await linked;

		expect(linkedRunId).toBe(launchedRun.id);
		if (resolveRun === undefined)
			throw new Error('Run completion resolver was not initialized');
		resolveRun(completedRun);
		expect(await execution).toEqual({
			agentMessage: 'the step’s closing message',
			errorMessage: undefined,
			exitCode: undefined,
			ok: true,
			outputSummary: 'finished',
		});
	});
});

describe('pipeline restart run recovery', () => {
	for (const status of ['running', 'completed'] as const) {
		test(`reattaches an unlinked ${status} run and persists the recovered id`, async () => {
			const sqlite = new Database(':memory:');
			sqlite.exec('PRAGMA foreign_keys = ON;');
			migrateWebDatabase(sqlite);
			const { db } = wrapWebDatabase(sqlite);
			try {
				await db.insert(pipelineSessions).values({
					currentStepIndex: 2,
					id: 'pipe_recovery',
					parametersJson: '{}',
					projectName: 'example',
					projectPath: PROJECT_PATH,
					recipeId: 'recovery-recipe',
					recipeName: 'Recovery recipe',
					startedAt: 500,
					status: 'running',
					totalSteps: 2,
				});
				await db
					.insert(runs)
					.values([
						makeRun('run_already_linked', 'completed', 1_000),
						makeRun('run_orphaned', status, 2_000),
					]);
				await db.insert(pipelineStepResults).values([
					{
						completedAt: 1_500,
						depth: 0,
						displayOrder: 1,
						id: 'result_completed',
						phase: 'step',
						runId: 'run_already_linked',
						sequenceNumber: 1,
						sessionId: 'pipe_recovery',
						startedAt: 700,
						status: 'completed',
						stepName: 'First',
						stepType: 'aidd-cli',
					},
					{
						depth: 0,
						displayOrder: 2,
						id: 'result_in_flight',
						phase: 'step',
						sequenceNumber: 2,
						sessionId: 'pipe_recovery',
						startedAt: 1_700,
						status: 'running',
						stepName: 'Second',
						stepType: 'aidd-cli',
					},
				]);
				const session = (
					await db
						.select()
						.from(pipelineSessions)
						.where(eq(pipelineSessions.id, 'pipe_recovery'))
						.limit(1)
				)[0];
				if (!session) throw new Error('Pipeline session fixture was not persisted');

				const resolution = await deriveResumeResolution(
					{
						activeSessionIds: () => new Set(),
						db,
						runService: {} as RunService,
						telemetryService: {} as TelemetryService,
					},
					session,
				);
				const recoveredStep = (
					await db
						.select()
						.from(pipelineStepResults)
						.where(eq(pipelineStepResults.id, 'result_in_flight'))
						.limit(1)
				)[0];

				expect(resolution.inFlightStep).toMatchObject({
					action: 're-attach',
					runId: 'run_orphaned',
				});
				expect(recoveredStep?.runId).toBe('run_orphaned');
			} finally {
				sqlite.close();
			}
		});
	}

	test('separates the successful completion count from the resume sequence', async () => {
		const sqlite = new Database(':memory:');
		sqlite.exec('PRAGMA foreign_keys = ON;');
		migrateWebDatabase(sqlite);
		const { db } = wrapWebDatabase(sqlite);
		try {
			await db.insert(pipelineSessions).values({
				currentStepIndex: 3,
				id: 'pipe_recovery',
				parametersJson: '{}',
				projectName: 'example',
				projectPath: PROJECT_PATH,
				recipeId: 'recovery-recipe',
				recipeName: 'Recovery recipe',
				startedAt: 500,
				status: 'running',
				totalSteps: 4,
			});
			await db.insert(pipelineStepResults).values([
				{
					completedAt: 1_500,
					depth: 0,
					displayOrder: 1,
					id: 'completed_step',
					phase: 'step',
					sequenceNumber: 1,
					sessionId: 'pipe_recovery',
					startedAt: 700,
					status: 'completed',
					stepName: 'Completed',
					stepType: 'shell',
				},
				{
					completedAt: 1_700,
					depth: 0,
					displayOrder: 2,
					id: 'failed_step',
					phase: 'step',
					sequenceNumber: 2,
					sessionId: 'pipe_recovery',
					startedAt: 1_600,
					status: 'failed',
					stepName: 'Failed but continued',
					stepType: 'shell',
				},
				{
					completedAt: 1_900,
					depth: 0,
					displayOrder: 3,
					id: 'stopped_step',
					phase: 'step',
					sequenceNumber: 3,
					sessionId: 'pipe_recovery',
					startedAt: 1_800,
					status: 'stopped',
					stepName: 'Stopped',
					stepType: 'shell',
				},
			]);
			const session = (
				await db
					.select()
					.from(pipelineSessions)
					.where(eq(pipelineSessions.id, 'pipe_recovery'))
			)[0];
			if (!session) throw new Error('Resume progress fixture was not persisted');

			const resolution = await deriveResumeResolution(
				{
					activeSessionIds: () => new Set(),
					db,
					runService: {} as RunService,
					telemetryService: {} as TelemetryService,
				},
				session,
			);
			const normalized = (
				await db
					.select()
					.from(pipelineSessions)
					.where(eq(pipelineSessions.id, 'pipe_recovery'))
			)[0];

			expect(normalized?.currentStepIndex).toBe(1);
			expect(resolution.startSequenceNumber).toBe(4);
		} finally {
			sqlite.close();
		}
	});

	test('keeps nested active progress incomplete across a second restart', async () => {
		const sqlite = new Database(':memory:');
		sqlite.exec('PRAGMA foreign_keys = ON;');
		migrateWebDatabase(sqlite);
		const { db } = wrapWebDatabase(sqlite);
		try {
			await db.insert(pipelineSessions).values({
				currentStepIndex: 2,
				id: 'pipe_recovery',
				parametersJson: '{}',
				projectName: 'example',
				projectPath: PROJECT_PATH,
				recipeId: 'nested-recovery',
				recipeName: 'Nested recovery',
				startedAt: 500,
				status: 'running',
				totalSteps: 3,
			});
			await db.insert(runs).values(makeRun('run_nested_live', 'running', 2_000));
			await db.insert(pipelineStepResults).values([
				{
					completedAt: 1_500,
					depth: 0,
					displayOrder: 1,
					id: 'nested_completed',
					phase: 'step',
					sequenceNumber: 1,
					sessionId: 'pipe_recovery',
					startedAt: 700,
					status: 'completed',
					stepName: 'Completed parent step',
					stepType: 'shell',
				},
				{
					depth: 0,
					displayOrder: 2,
					id: 'nested_wrapper',
					phase: 'step',
					sequenceNumber: 2,
					sessionId: 'pipe_recovery',
					startedAt: 1_700,
					status: 'running',
					stepName: 'Active nested recipe',
					stepType: 'recipe-ref',
				},
				{
					depth: 1,
					displayOrder: 3,
					id: 'nested_child',
					parentStepResultId: 'nested_wrapper',
					phase: 'step',
					runId: 'run_nested_live',
					sequenceNumber: 1,
					sessionId: 'pipe_recovery',
					startedAt: 1_800,
					status: 'running',
					stepName: 'Active managed child',
					stepType: 'aidd-cli',
				},
			]);
			const runService: Pick<RunService, 'getRun'> = {
				getRun: async () => makeRun('run_nested_live', 'running', 2_000),
			};
			const deps = {
				activeSessionIds: () => new Set<string>(),
				db,
				runService,
				telemetryService: {} as TelemetryService,
			};
			const initialSession = (
				await db
					.select()
					.from(pipelineSessions)
					.where(eq(pipelineSessions.id, 'pipe_recovery'))
			)[0];
			if (!initialSession) throw new Error('Nested recovery fixture was not persisted');

			const firstRestart = await deriveResumeResolution(deps, initialSession);
			const normalizedSession = (
				await db
					.select()
					.from(pipelineSessions)
					.where(eq(pipelineSessions.id, 'pipe_recovery'))
			)[0];
			if (!normalizedSession) throw new Error('Normalized session was not persisted');
			expect(normalizedSession.currentStepIndex).toBe(1);
			expect(firstRestart.inFlightStep).toMatchObject({
				action: 'resume-recipe',
				child: { action: 're-attach', runId: 'run_nested_live' },
				sequenceNumber: 2,
			});

			const secondRestart = await deriveResumeResolution(deps, normalizedSession);
			const secondRestartSession = (
				await db
					.select()
					.from(pipelineSessions)
					.where(eq(pipelineSessions.id, 'pipe_recovery'))
			)[0];
			expect(secondRestartSession?.currentStepIndex).toBe(1);
			expect(secondRestart.inFlightStep).toMatchObject({
				action: 'resume-recipe',
				child: { action: 're-attach', runId: 'run_nested_live' },
				sequenceNumber: 2,
			});
		} finally {
			sqlite.close();
		}
	});
});
