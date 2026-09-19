import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';

import type { WebDatabaseHandle } from '../db/client.ts';
import type { WebSocketHub } from '../webSocketHub.ts';
import type { AppWatchdog } from './appLauncher/watchdog.ts';
import type { ProjectService } from './projectService.ts';
import type { RunService } from './runService.ts';
import type { TelemetryService } from './telemetryService.ts';

import { AuditService } from './auditService.ts';
import { DirectiveLaunchService } from './directiveLaunchService.ts';
import { PipelineService } from './pipelineService.ts';
import { RecipeService } from './recipeService.ts';
import { ScheduledTaskService } from './scheduledTaskService.ts';
import { SkillLaunchService } from './skillLaunchService.ts';
import { SkillService } from './skillService.ts';

export interface ExecutionServices {
	auditService: AuditService;
	pipelineService: PipelineService;
	recipeService: RecipeService;
	scheduledTaskService: ScheduledTaskService;
	skillLaunchService: SkillLaunchService;
	skillService: SkillService;
}

export function createExecutionServices(input: {
	appWatchdog?: AppWatchdog;
	config: { web: ResolvedWebConfig } & ResolvedConfig;
	database: WebDatabaseHandle;
	hub: WebSocketHub;
	projectService: ProjectService;
	rootDir: string;
	runService: RunService;
	telemetryService: TelemetryService;
}): ExecutionServices {
	const recipeService = new RecipeService(input.rootDir, input.config.web.dataDir);
	const skillService = new SkillService({
		allowedRoots: input.config.web.allowedRoots,
		dataDir: input.config.web.dataDir,
		rootDir: input.rootDir,
	});
	const auditService = new AuditService(
		input.config,
		input.projectService,
		input.runService,
		input.rootDir,
		input.telemetryService,
		input.database.db,
	);
	const pipelineService = new PipelineService({
		...(input.appWatchdog ? { appWatchdog: input.appWatchdog } : {}),
		db: input.database.db,
		hub: input.hub,
		projectService: input.projectService,
		recipeService,
		runService: input.runService,
		skillService,
		telemetryService: input.telemetryService,
	});
	const skillLaunchService = new SkillLaunchService(pipelineService, skillService);
	const directiveLaunchService = new DirectiveLaunchService(
		input.runService,
		input.telemetryService,
	);
	const scheduledTaskService = new ScheduledTaskService(
		input.database,
		input.projectService,
		recipeService,
		skillService,
		auditService,
		pipelineService,
		skillLaunchService,
		directiveLaunchService,
	);
	return {
		auditService,
		pipelineService,
		recipeService,
		scheduledTaskService,
		skillLaunchService,
		skillService,
	};
}
