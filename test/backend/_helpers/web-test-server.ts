import { join } from 'node:path';
import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import { createWebDatabase } from '../../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../../backend/src/db/migrate.ts';
import { createWebServer } from '../../../backend/src/server.ts';
import { AppLauncherService } from '../../../backend/src/services/appLauncher/launcher.ts';
import { DiaryService } from '../../../backend/src/services/diaryService.ts';
import { DirectorService } from '../../../backend/src/services/directorService.ts';
import { SkillService } from '../../../backend/src/services/skillService.ts';
import { disabledDirectAiRunner } from '../../../backend/src/services/directAiService.ts';
import { PipelineService } from '../../../backend/src/services/pipelineService.ts';
import { ProjectInitFailureService } from '../../../backend/src/services/project/initFailureService.ts';
import { ProjectService } from '../../../backend/src/services/projectService.ts';
import { RecipeService } from '../../../backend/src/services/recipeService.ts';
import { RunService } from '../../../backend/src/services/runService.ts';
import { SettingsService } from '../../../backend/src/services/settingsService.ts';
import { MetricsService } from '../../../backend/src/services/metricsService.ts';
import { TelemetryService } from '../../../backend/src/services/telemetryService.ts';
import { TerminalSessionManager } from '../../../backend/src/services/terminal/sessionManager.ts';
import { WebSocketHub } from '../../../backend/src/webSocketHub.ts';

// The fully assembled web server, wired the way backend/src/start.ts wires it, on a temporary
// database. Tests that must prove what is mounted (not just what a plugin does on its own) use
// this rather than composing plugins by hand.
function makeConfig(web: ResolvedWebConfig): { web: ResolvedWebConfig } & ResolvedConfig {
	return {
		cli: 'native',
		dirtyTreeThreshold: 50,
		idleNudgeTimeoutSeconds: 600,
		idleTimeoutSeconds: 900,
		maxConsecutiveTimeoutRetries: 2,
		maxIterations: null,
		noClean: false,
		noWorkBackoffMs: 30_000,
		quitOnAbort: 0,
		rateLimitBackoffSeconds: 300,
		rateLimitBufferSeconds: 60,
		reasoningEffort: 'low',
		timeoutSeconds: 3600,
		preflightDoctor: false,
		web,
	};
}

export async function createTestServer(rootDir: string, workspace: string) {
	const web = {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [workspace],
		dataDir: join(workspace, 'data'),
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		autoChainLimit: 3,
		autoChainRuns: false,
		useWorktrees: false,
		port: 3210,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		showSpernakitProject: false,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: true,
	};
	const config = makeConfig(web);
	const database = await createWebDatabase(web);
	if (database.sqlite) migrateWebDatabase(database.sqlite);
	const webSocketHub = new WebSocketHub();
	const projectService = new ProjectService(web);
	const telemetryService = new TelemetryService({ commands: database.commands, db: database.db });
	const metricsService = new MetricsService({
		dataDir: web.dataDir,
		db: database.db,
		getActiveConnections: () => webSocketHub.peerCount,
	});
	const runService = new RunService(
		config,
		database.db,
		database.commands,
		webSocketHub,
		projectService,
		rootDir,
		telemetryService,
	);
	const recipeService = new RecipeService(rootDir);
	const skillService = new SkillService({ rootDir });
	const pipelineService = new PipelineService({
		commands: database.commands,
		db: database.db,
		hub: webSocketHub,
		skillService,
		projectService,
		recipeService,
		runService,
		telemetryService,
	});
	const directorService = new DirectorService(
		config,
		database.db,
		database.commands,
		webSocketHub,
		projectService,
		runService,
	);
	const appLauncherService = new AppLauncherService({ db: database.db, projectService });
	const diaryService = new DiaryService({
		commands: database.commands,
		db: database.db,
		projectService,
		rootDir,
	});
	const app = createWebServer({
		appLauncherService,
		config,
		diaryService,
		directorService,
		database,
		directAiService: disabledDirectAiRunner,
		initFailureService: new ProjectInitFailureService(database.db),
		skillService,
		metricsService,
		pipelineService,
		projectService,
		recipeService,
		rootDir,
		runService,
		settingsService: new SettingsService(config, join(workspace, 'user-config.json')),
		telemetryService,
		terminalSessionManager: new TerminalSessionManager({
			listShells: () => [],
			rootDir,
			spawnPty: null,
		}),
		webSocketHub,
	});
	return { app, config, database, runService };
}
