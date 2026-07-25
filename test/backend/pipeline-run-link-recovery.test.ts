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
});
