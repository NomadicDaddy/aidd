import { Database } from 'bun:sqlite';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { RunService } from '../../../backend/src/services/runService.ts';
import type { RecipeDefinition } from '../../../backend/src/types.ts';

import { type WebDatabase, wrapWebDatabase } from '../../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../../backend/src/db/migrate.ts';
import {
	pipelineSessions,
	pipelineStepResults,
	runs as runsTable,
} from '../../../backend/src/db/schema.ts';
import { PipelineService } from '../../../backend/src/services/pipelineService.ts';
import { ProjectService } from '../../../backend/src/services/projectService.ts';
import { RecipeService } from '../../../backend/src/services/recipeService.ts';
import { SkillService } from '../../../backend/src/services/skillService.ts';
import { TelemetryService } from '../../../backend/src/services/telemetryService.ts';
import { WebSocketHub } from '../../../backend/src/webSocketHub.ts';

export interface FakeRunRow {
	aiSummary: null | string;
	completedAt: null | number;
	errorMessage: null | string;
	exitCode: null | number;
	heartbeatAt: null | number;
	id: string;
	status: string;
	stopReason: null | string;
	summary: null | string;
}

/**
 * A run service standing in for detached CLI runs. A run stays 'running' until the test ends it,
 * the way a real one works on until its iteration boundary; `exited` models a run whose process is
 * already gone while its row still says running, which the real stopRun terminalizes on the spot.
 */
export function fakeRunService(db: WebDatabase) {
	const runs = new Map<string, { exited: boolean; row: FakeRunRow; stopRequested: boolean }>();
	const calls: string[] = [];
	const live = (id: string) => {
		const run = runs.get(id);
		if (!run) throw new Error(`Run not found: ${id}`);
		if (run.row.status !== 'running') throw new Error(`Run already terminal: ${id}`);
		return run;
	};
	const service = {
		getRun: async (id: string) => runs.get(id)?.row,
		hasActiveRunForProject: async () => false,
		killRun: async (id: string) => {
			calls.push(`kill:${id}`);
			const run = live(id);
			Object.assign(run.row, {
				completedAt: Date.now(),
				exitCode: -1,
				status: 'killed',
				stopReason: 'killed',
			});
		},
		launchRun: async () => {
			const id = `run_${runs.size + 1}`;
			const row: FakeRunRow = {
				aiSummary: null,
				completedAt: null,
				errorMessage: null,
				exitCode: null,
				heartbeatAt: Date.now(),
				id,
				status: 'running',
				stopReason: null,
				summary: null,
			};
			runs.set(id, { exited: false, row, stopRequested: false });
			const startedAt = Date.now();
			// The step row links its run by foreign key, so the run needs a row of its own.
			await db.insert(runsTable).values({
				backend: 'codex',
				id,
				mode: 'directive',
				projectName: 'p',
				projectPath: 'p',
				source: 'web',
				startedAt,
				status: 'running',
			});
			return {
				backend: 'codex',
				id,
				model: null,
				projectName: 'p',
				projectPath: 'p',
				startedAt,
			};
		},
		readOutput: async () => {
			throw new Error('no transcript in this harness');
		},
		requestRetentionSweep: () => undefined,
		stopRun: async (id: string) => {
			calls.push(`stop:${id}`);
			const run = live(id);
			run.stopRequested = true;
			if (!run.exited) return;
			Object.assign(run.row, {
				completedAt: Date.now(),
				exitCode: 0,
				status: 'stopped',
				stopReason: 'stop_requested',
			});
		},
	};
	/** The run reaches its iteration boundary and ends with this outcome. */
	const finish = (id: string, outcome: Partial<FakeRunRow>) => {
		const run = runs.get(id);
		if (!run) throw new Error(`Run not found: ${id}`);
		Object.assign(run.row, { completedAt: Date.now(), ...outcome });
	};
	return { calls, finish, runs, service: service as unknown as RunService };
}

export async function makeStopHarness(workspace: string) {
	const rootDir = join(workspace, 'root');
	const projectDir = join(workspace, 'project');
	await mkdir(join(rootDir, 'recipes'), { recursive: true });
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrateWebDatabase(sqlite);
	const { commands, db } = wrapWebDatabase(sqlite);
	const projectService = new ProjectService({
		allowedOrigins: [],
		allowedRoots: [workspace],
		allowRemote: false,
		autoChainLimit: 3,
		autoChainRuns: false,
		dataDir: join(workspace, 'data'),
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		port: 3210,
		showSpernakitProject: false,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: true,
		useWorktrees: false,
	});
	const recipeService = new RecipeService(rootDir);
	const runs = fakeRunService(db);
	const pipelineService = new PipelineService({
		commands,
		db,
		hub: new WebSocketHub(),
		projectService,
		recipeService,
		runService: runs.service,
		skillService: new SkillService({ rootDir }),
		telemetryService: new TelemetryService({ commands, db }),
	});
	const launch = async (recipe: Omit<RecipeDefinition, 'parameters'>) => {
		await recipeService.writeRecipe({ ...recipe, parameters: [] });
		return pipelineService.launchRecipe({
			initiator: 'operator',
			projectDir,
			recipeId: recipe.id,
		});
	};
	const session = async (id: string) =>
		(await db.select().from(pipelineSessions)).find((row) => row.id === id);
	const steps = async (id: string) =>
		(await db.select().from(pipelineStepResults)).filter((row) => row.sessionId === id);
	const dispose = () => {
		pipelineService.signalStopAll();
		sqlite.close();
	};
	return {
		db,
		dispose,
		launch,
		pipelineService,
		projectDir,
		recipeService,
		runs,
		session,
		steps,
	};
}

export async function waitFor(check: () => Promise<boolean> | boolean, label: string) {
	const deadline = Date.now() + 10_000;
	while (!(await check())) {
		if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
		await Bun.sleep(25);
	}
}
