import type { ResolvedConfig } from 'aidd-shared/config';

import type { WebDatabaseHandle } from './db/client.ts';
import type { AppLauncherService } from './services/appLauncher/launcher.ts';
import type { AuditService } from './services/auditService.ts';
import type { DiaryService } from './services/diaryService.ts';
import type { DirectAiRunner } from './services/directAiService.ts';
import type { DirectorService } from './services/directorService.ts';
import type { MetricsService } from './services/metricsService.ts';
import type { PipelineService } from './services/pipelineService.ts';
import type { ProjectInitFailureService } from './services/project/initFailureService.ts';
import type { ProjectService } from './services/projectService.ts';
import type { RecipeService } from './services/recipeService.ts';
import type { RunService } from './services/runService.ts';
import type { SettingsService } from './services/settingsService.ts';
import type { SkillService } from './services/skillService.ts';
import type { TelegramBridgeService } from './services/telegramBridgeService.ts';
import type { TelemetryService } from './services/telemetryService.ts';
import type { TerminalSessionManager } from './services/terminal/sessionManager.ts';
import type { WebSocketHub } from './webSocketHub.ts';

export interface WebContext {
	appLauncherService: AppLauncherService;
	auditService?: AuditService;
	config: ResolvedConfig;
	database: WebDatabaseHandle;
	diaryService: DiaryService;
	directAiService: DirectAiRunner;
	directorService: DirectorService;
	initFailureService: ProjectInitFailureService;
	metricsService: MetricsService;
	pipelineService: PipelineService;
	projectService: ProjectService;
	recipeService: RecipeService;
	/**
	 * Starts a detached restart supervisor, then gracefully shuts down this
	 * backend so the supervisor can bind the released web port.
	 */
	requestRestart?: (reason: string) => boolean;
	/**
	 * Triggers a graceful shutdown of the web control panel (close the listener,
	 * drop active connections, tear down the DB worker, exit). Wired by start.ts;
	 * absent in test harnesses that mount routes without a process to stop.
	 */
	requestShutdown?: (reason: string) => void;
	rootDir: string;
	runService: RunService;
	settingsService: SettingsService;
	skillService: SkillService;
	telegramBridgeService?: TelegramBridgeService;
	telemetryService: TelemetryService;
	terminalSessionManager: TerminalSessionManager;
	webSocketHub: WebSocketHub;
}
