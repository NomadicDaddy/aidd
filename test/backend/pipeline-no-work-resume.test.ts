import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../backend/src/db/client.ts';
import type { RecipeService } from '../../backend/src/services/recipeService.ts';
import type { RunService } from '../../backend/src/services/runService.ts';
import type { SkillService } from '../../backend/src/services/skillService.ts';
import type { TelemetryService } from '../../backend/src/services/telemetryService.ts';
import type { ExecutionContext } from '../../backend/src/services/pipeline/types.ts';
import type { RecipeDefinition } from '../../backend/src/types.ts';
import type { WebSocketHub } from '../../backend/src/webSocketHub.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { pipelineSessions, pipelineStepResults, runs } from '../../backend/src/db/schema.ts';
import { BroadcastService } from '../../backend/src/services/pipeline/broadcastService.ts';
import { ReportBuilder } from '../../backend/src/services/pipeline/reportBuilder.ts';
import { SessionLifecycle } from '../../backend/src/services/pipeline/sessionLifecycle.ts';
import { StepExecutor } from '../../backend/src/services/pipeline/stepExecutor.ts';

const SESSION_ID = 'pipe_no_work_resume';
const PROJECT_PATH = 'd:/applications/example';

const RECIPE = {
	steps: [
		{
			configJson: { skipRemainingOnNoWork: true },
			id: 's1',
			name: 'Run coding',
			stepType: 'aidd-cli',
		},
		{ configJson: { prompt: 'Review.' }, id: 's2', name: 'Review', stepType: 'aidd-cli' },
		{ configJson: { prompt: 'Fix.' }, id: 's3', name: 'Remediate', stepType: 'aidd-cli' },
		{ configJson: { prompt: 'Record.' }, id: 's4', name: 'Document', stepType: 'aidd-cli' },
	],
} as unknown as RecipeDefinition;

// A migrated database, the real lifecycle, report and reconciler over it, and a run service whose
// coding runs find nothing to do while every other run records real work.
function harness() {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const { db } = wrapWebDatabase(sqlite);
	const launched: string[] = [];
	const runService = {
		getRun: async (id: string) =>
			(await db.select().from(runs).where(eq(runs.id, id)).limit(1))[0],
		launchRun: async (request: { mode?: string }) => {
			const mode = request.mode ?? 'coding';
			launched.push(mode);
			return insertRun(
				db,
				`run_launched_${launched.length}`,
				mode === 'coding' ? 'no_work' : 'completed',
			);
		},
		readOutput: async () => ({ output: '[aidd] claude-code run started' }),
	} as unknown as RunService;
	const report = new ReportBuilder(db);
	const lifecycle = new SessionLifecycle({
		activeExecutions: new Map(),
		activeShellProcesses: new Map(),
		broadcast: new BroadcastService({ broadcast: () => {} } as unknown as WebSocketHub),
		db,
		report,
		runService,
		stopFlags: new Set(),
		telemetryService: {} as TelemetryService,
	});
	const executor = new StepExecutor({
		activeShellProcesses: new Map(),
		db,
		getAllowedRoots: () => [],
		lifecycle,
		recipeService: {} as RecipeService,
		runService,
		skillService: {} as SkillService,
		stopFlags: new Set(),
		telemetryService: {} as TelemetryService,
	});
	return { db, executor, launched, lifecycle, report, sqlite };
}

async function insertRun(db: WebDatabase, id: string, stopReason: string) {
	const row = {
		backend: 'claude-code',
		completedAt: 2,
		exitCode: 0,
		id,
		mode: 'coding',
		pipelineSessionId: SESSION_ID,
		projectName: 'example',
		projectPath: PROJECT_PATH,
		source: 'web',
		startedAt: 1,
		status: 'completed',
		stopReason,
		summary: stopReason === 'no_work' ? 'No eligible incomplete coding features.' : 'Done.',
	};
	await db.insert(runs).values(row);
	return { ...row, model: null };
}

async function seedSession(db: WebDatabase): Promise<void> {
	await db.insert(pipelineSessions).values({
		currentStepIndex: 0,
		id: SESSION_ID,
		parametersJson: '{}',
		projectName: 'example',
		projectPath: PROJECT_PATH,
		recipeId: 'coding',
		recipeName: 'coding',
		startedAt: 1,
		status: 'running',
		totalSteps: RECIPE.steps.length,
	});
}

// A step row as a run that finished before the restart left it.
async function seedStepRow(
	db: WebDatabase,
	sequenceNumber: number,
	status: 'completed' | 'skipped',
	runId: null | string,
): Promise<void> {
	const step = RECIPE.steps[sequenceNumber - 1];
	if (!step) throw new Error(`no step ${sequenceNumber}`);
	await db.insert(pipelineStepResults).values({
		completedAt: 2,
		depth: 0,
		displayOrder: sequenceNumber,
		id: `row_seed_${sequenceNumber}`,
		phase: 'step',
		runId,
		sequenceNumber,
		sessionId: SESSION_ID,
		startedAt: 1,
		status,
		stepDefinitionId: step.id,
		stepName: step.name,
		stepType: step.stepType,
	});
}

function context(displayOrder: number): ExecutionContext {
	return {
		depth: 0,
		displayOrder,
		initiator: 'operator',
		lineage: [],
		parameters: {},
		projectDir: PROJECT_PATH,
		sessionId: SESSION_ID,
	};
}

// Restarts the session the way the web panel does after a restart: the reconciler says where to
// resume, and the executor carries on from there.
async function resume(h: ReturnType<typeof harness>) {
	const session = (
		await h.db.select().from(pipelineSessions).where(eq(pipelineSessions.id, SESSION_ID))
	)[0];
	if (!session) throw new Error('session missing');
	const resolution = await h.lifecycle.deriveResumeResolution(session);
	expect(resolution.inFlightStep).toBeUndefined();
	return await h.executor.executeRecipeSteps(
		RECIPE,
		context(resolution.displayOrder),
		undefined,
		resolution.startSequenceNumber,
	);
}

async function stepRows(db: WebDatabase) {
	return (
		await db
			.select()
			.from(pipelineStepResults)
			.where(eq(pipelineStepResults.sessionId, SESSION_ID))
	)
		.map((row) => [row.sequenceNumber, row.status] as const)
		.sort((a, b) => a[0] - b[0]);
}

const ENDED_EARLY: (readonly [number, string])[] = [
	[1, 'completed'],
	[2, 'skipped'],
	[3, 'skipped'],
	[4, 'skipped'],
];

describe('a no-work pipeline across a restart', () => {
	// The count the session list and report read, not the in-memory rows: before skipped steps had
	// their own count, a session that ended early finished green reading "1 of 4 completed".
	test('reports the skipped steps apart from the one that ran', async () => {
		const h = harness();
		try {
			await seedSession(h.db);

			await h.executor.executeRecipeSteps(RECIPE, context(0));

			expect(h.launched).toEqual(['coding']);
			expect(await stepRows(h.db)).toEqual(ENDED_EARLY);
			const session = await h.report.getSession(SESSION_ID);
			expect(session?.completedTopLevelSteps).toBe(1);
			expect(session?.skippedTopLevelSteps).toBe(3);
		} finally {
			h.sqlite.close();
		}
	});

	test('finishes the skips when the restart came before any was written', async () => {
		const h = harness();
		try {
			await seedSession(h.db);
			await insertRun(h.db, 'run_1', 'no_work');
			await seedStepRow(h.db, 1, 'completed', 'run_1');

			expect(await resume(h)).toEqual({ ok: true, stopped: false });

			// Nothing launched: the review, remediation and documentation stay skipped.
			expect(h.launched).toEqual([]);
			expect(await stepRows(h.db)).toEqual(ENDED_EARLY);
		} finally {
			h.sqlite.close();
		}
	});

	test('writes only the skips a restart interrupted', async () => {
		const h = harness();
		try {
			await seedSession(h.db);
			await insertRun(h.db, 'run_1', 'no_work');
			await seedStepRow(h.db, 1, 'completed', 'run_1');
			await seedStepRow(h.db, 2, 'skipped', null);

			await resume(h);

			expect(h.launched).toEqual([]);
			// One row per step: the skip written before the restart is not written again.
			expect(await stepRows(h.db)).toEqual(ENDED_EARLY);
		} finally {
			h.sqlite.close();
		}
	});

	test('carries on as normal after a step that did its work', async () => {
		const h = harness();
		try {
			await seedSession(h.db);
			await insertRun(h.db, 'run_1', 'completed');
			await seedStepRow(h.db, 1, 'completed', 'run_1');

			await resume(h);

			expect(h.launched).toEqual(['directive', 'directive', 'directive']);
			const session = await h.report.getSession(SESSION_ID);
			expect(session?.completedTopLevelSteps).toBe(4);
			expect(session?.skippedTopLevelSteps).toBe(0);
		} finally {
			h.sqlite.close();
		}
	});
});
