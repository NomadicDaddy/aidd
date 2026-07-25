import { killProcessTree } from 'aidd-shared/lib/processTree';

import type { WebDatabase } from '../db/client.ts';
import type { PipelineSessionRecord, PipelineSessionReport } from '../types.ts';
import type { WebSocketHub } from '../webSocketHub.ts';
import type { CursorPage } from './pagination.ts';
import type { LaunchPipelineInput, PipelineSessionRow } from './pipeline/types.ts';
import type { ProjectService } from './projectService.ts';
import type { RunService } from './runService.ts';
import type { SkillService } from './skillService.ts';
import type { TelemetryService } from './telemetryService.ts';

import { webLogger } from '../logger.ts';
import { BroadcastService } from './pipeline/broadcastService.ts';
import { LaunchService } from './pipeline/launchService.ts';
import { ReportBuilder } from './pipeline/reportBuilder.ts';
import { SessionLifecycle } from './pipeline/sessionLifecycle.ts';
import { dumpSessionMetrics } from './pipeline/sessionMetricsDump.ts';
import { StepExecutor } from './pipeline/stepExecutor.ts';
import { RecipeNotFoundError, type RecipeService } from './recipeService.ts';

export class PipelineService {
	private readonly activeExecutions = new Map<string, Promise<void>>();
	private readonly activeShellProcesses = new Map<string, Set<ReturnType<typeof Bun.spawn>>>();
	private readonly stopFlags = new Set<string>();
	private readonly report: ReportBuilder;
	private readonly lifecycle: SessionLifecycle;
	private readonly launch: LaunchService;
	private readonly recipeService: RecipeService;

	constructor(input: {
		db: WebDatabase;
		hub: WebSocketHub;
		projectService: ProjectService;
		recipeService: RecipeService;
		runService: RunService;
		skillService: SkillService;
		telemetryService: TelemetryService;
	}) {
		this.recipeService = input.recipeService;
		const broadcast = new BroadcastService(input.hub);
		this.report = new ReportBuilder(input.db, input.recipeService);
		this.lifecycle = new SessionLifecycle({
			activeExecutions: this.activeExecutions,
			activeShellProcesses: this.activeShellProcesses,
			broadcast,
			db: input.db,
			report: this.report,
			runService: input.runService,
			stopFlags: this.stopFlags,
			telemetryService: input.telemetryService,
		});
		const reportForDump = this.report;
		const stepExecutor = new StepExecutor({
			activeShellProcesses: this.activeShellProcesses,
			afterTopLevelStep: (sessionId, projectDir) =>
				dumpSessionMetrics(reportForDump, sessionId, projectDir),
			db: input.db,
			getAllowedRoots: () => input.projectService.getAllowedRoots(),
			lifecycle: this.lifecycle,
			recipeService: input.recipeService,
			runService: input.runService,
			skillService: input.skillService,
			stopFlags: this.stopFlags,
			telemetryService: input.telemetryService,
		});
		this.launch = new LaunchService({
			activeExecutions: this.activeExecutions,
			broadcast,
			db: input.db,
			lifecycle: this.lifecycle,
			projectService: input.projectService,
			recipeService: input.recipeService,
			report: this.report,
			stepExecutor,
			stopFlags: this.stopFlags,
			telemetryService: input.telemetryService,
		});
	}

	getReport(id: string): Promise<PipelineSessionReport | undefined> {
		return this.report.getReport(id);
	}

	getSession(id: string): Promise<PipelineSessionRecord | undefined> {
		return this.report.getSession(id);
	}

	launchRecipe(input: LaunchPipelineInput): Promise<PipelineSessionRecord> {
		return this.launch.launchRecipe(input);
	}

	listSessions(
		options: { cursor?: string; limit?: number } = {},
	): Promise<CursorPage<PipelineSessionRecord>> {
		return this.report.listSessions(options);
	}

	// Resume in-flight pipeline sessions across web restarts. Per-step CLI runs detach
	// via launchRun + the cli heartbeat, so when web comes back up the orchestration
	// loop is the only thing missing — we rebuild it from the persisted recipe + step
	// results and re-attach to any still-running managed runs. Sessions whose recipe
	// is gone, or whose in-flight step was a shell/hook that died with web, are failed
	// inline (the in-flight step is marked failed; the session terminates per onFailure).
	async resumeStaleSessions(): Promise<void> {
		const { failedCount, resumable } = await this.lifecycle.reconcileStaleSessions((session) =>
			this.classifySessionForResume(session),
		);
		let resumedCount = 0;
		for (const entry of resumable) {
			try {
				const recipe = await this.recipeService.readRecipe(entry.session.recipeId);
				this.launch.resumeSession({
					recipe,
					resolution: entry.resolution,
					session: entry.session,
				});
				resumedCount += 1;
			} catch (err) {
				webLogger.warn(
					{ err, sessionId: entry.session.id },
					'pipelineService.resumeStaleSessions: failed to relaunch session',
				);
			}
		}
		if (resumedCount > 0 || failedCount > 0) {
			webLogger.info(
				{ failedCount, resumedCount },
				'pipelineService.resumeStaleSessions: reconciled in-flight pipeline sessions',
			);
		}
	}

	private async classifySessionForResume(
		session: PipelineSessionRow,
	): Promise<{ fail: string } | Awaited<ReturnType<SessionLifecycle['deriveResumeResolution']>>> {
		try {
			await this.recipeService.readRecipe(session.recipeId);
		} catch (err) {
			if (err instanceof RecipeNotFoundError) {
				return {
					fail: `Recipe not found; pipeline session cannot be resumed: ${session.recipeId}`,
				};
			}
			throw err;
		}
		return await this.lifecycle.deriveResumeResolution(session);
	}

	stopSession(id: string): Promise<void> {
		return this.lifecycle.stopSession(id);
	}

	// Mark every in-flight session for stop and synchronously kill any tracked shell
	// processes. Does not await execution promises or process exits — those are owned by
	// background catches in LaunchService.launchRecipe and StepExecutor, which swallow any
	// post-close DB rejection. Synchronous and non-blocking so test teardown can close the
	// SQLite handle immediately after calling this.
	signalStopAll(): void {
		for (const sessionId of this.activeExecutions.keys()) {
			this.stopFlags.add(sessionId);
		}
		for (const shellProcesses of this.activeShellProcesses.values()) {
			for (const childProcess of shellProcesses) {
				try {
					childProcess.kill();
				} catch {
					// best-effort cleanup; the process may have already exited
				}
				void killProcessTree(childProcess.pid).catch(() => {
					// background tree-kill; failure here is non-fatal
				});
			}
		}
	}
}
