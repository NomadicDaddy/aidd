import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';

import { type AiddRunProvenance, resolveAiddRunProvenance } from 'aidd-shared/run-provenance';

import type { WebDatabase } from '../db/client.ts';
import type { DbCommands } from '../db/commands.ts';
import type { RunLaunchRequest, WebRunStatus } from '../types.ts';
import type { WebSocketHub } from '../webSocketHub.ts';
import type { HeartbeatWatcher } from './run/heartbeatWatcher.ts';
import type { TelemetryService } from './telemetryService.ts';

import { type runs } from '../db/schema.ts';
import { type ProjectService } from './projectService.ts';
import { startRunServiceTimers } from './run/backgroundTimers.ts';
import { createRunContinuationWiring } from './run/continuationWiring.ts';
import {
	type ControlContext,
	killRun as killRunInternal,
	stopRun as stopRunInternal,
} from './run/control.ts';
import { ingestCompletedCliRuns as ingestCompletedCliRunsInternal } from './run/ingest.ts';
import { launchRun as launchRunInternal, type LaunchRunOptions } from './run/launch.ts';
import { reconcileRunLedgerDrift } from './run/ledgerBackfillSweep.ts';
import { readOutput as readOutputInternal, type RunOutputResult } from './run/output.ts';
import {
	reconcileStaleRuns as reconcileStaleRunsInternal,
	sweepOrphanedRuns as sweepOrphanedRunsInternal,
} from './run/queries.ts';
import { RunQueryService } from './run/queryService.ts';
import { disposeRunRuntime, ensureRunHeartbeatWatcher } from './run/serviceRuntime.ts';
import { applySweptRunSideEffects } from './run/sweepSideEffects.ts';
import { type RunTailWatcher } from './run/tailWatcher.ts';
import { RunControlError } from './run/types.ts';
import { waitForTerminalStatus } from './run/waitForTerminal.ts';

export { RunControlError };
export type { RunOutputResult };

// The SQLite `runs` table is the supervisor surface; the actual child processes are
// detached and outlive the web server. tailWatchers and heartbeatWatchers are
// filesystem-event watchers, not process owners — closing them does not kill any child.
export class RunService extends RunQueryService {
	private readonly heartbeatWatchers = new Map<string, HeartbeatWatcher>();
	private readonly tailWatchers = new Map<string, RunTailWatcher>();
	private readonly ingestTimer: null | ReturnType<typeof setInterval> = null;
	private readonly orphanSweepTimer: null | ReturnType<typeof setInterval> = null;
	private readonly projectService: ProjectService;
	private readonly rootDir: string;
	private readonly telemetryService: TelemetryService;
	// Thunks: this initializes before the ctor assigns db/telemetry, and config is hot-swapped.
	private readonly continuation = createRunContinuationWiring({
		db: () => this.db,
		launch: (request) => this.launchRun(request),
		telemetry: () => this.telemetryService,
		webConfig: () => this.config.web,
	});
	private disposed = false;

	constructor(
		config: { web: ResolvedWebConfig } & ResolvedConfig,
		db: WebDatabase,
		commands: DbCommands,
		hub: WebSocketHub,
		projectService: ProjectService,
		rootDir: string,
		telemetryService: TelemetryService,
	) {
		super(config, db, commands, hub, (projectPath) =>
			projectService.invalidateProjectListing(projectPath),
		);
		this.projectService = projectService;
		this.rootDir = rootDir;
		this.telemetryService = telemetryService;
		const timers = startRunServiceTimers({
			ingestCompletedCliRuns: () => this.ingestCompletedCliRuns(),
			isDisposed: () => this.disposed,
			reconcileRunLedgerDrift: () => this.reconcileRunLedgerDrift(),
			sweepOrphanedRuns: () => this.sweepOrphanedRuns(),
		});
		this.ingestTimer = timers.ingestTimer;
		this.orphanSweepTimer = timers.orphanSweepTimer;
	}

	updateConfig(config: { web: ResolvedWebConfig } & ResolvedConfig): void {
		this.config = config;
	}

	async resolveRunProvenance(): Promise<AiddRunProvenance> {
		return resolveAiddRunProvenance(this.rootDir);
	}

	// Detached children intentionally outlive web shutdown — we close fs.watch handles
	// here but never kill the spawned CLIs. On restart, heartbeat files surface them
	// again through reconcileStaleRuns().
	markDisposed(): void {
		this.disposed = true;
		disposeRunRuntime({
			heartbeatWatchers: this.heartbeatWatchers,
			ingestTimer: this.ingestTimer,
			orphanSweepTimer: this.orphanSweepTimer,
			tailWatchers: this.tailWatchers,
		});
	}

	// Boot-time reconciliation of non-terminal rows; see activeRunReconcile.ts for mechanics.
	async reconcileStaleRuns(): Promise<void> {
		const resumable = await reconcileStaleRunsInternal(this.queriesContext());
		for (const info of resumable) {
			await this.ensureHeartbeatWatcher(info.projectPath);
		}
	}

	// Periodic orphan sweep (see activeRunSweep.ts); returns the count reconciled. Each swept run
	// gets the same terminal side effects the heartbeat paths run (tail stop, telemetry close).
	async sweepOrphanedRuns(): Promise<number> {
		const swept = await sweepOrphanedRunsInternal(this.queriesContext());
		for (const info of swept) {
			await applySweptRunSideEffects(
				{ tailWatchers: this.tailWatchers, telemetryService: this.telemetryService },
				info,
			);
		}
		return swept.length;
	}

	// Backfill terminal rows whose exit_code/stop_reason are NULL from runs.jsonl (fill-NULL-
	// only). See ledgerBackfillSweep.ts for the drift mechanics.
	async reconcileRunLedgerDrift(): Promise<number> {
		return reconcileRunLedgerDrift(this.db);
	}

	async launchRun(
		input: RunLaunchRequest,
		options: LaunchRunOptions = {},
	): Promise<typeof runs.$inferSelect> {
		return launchRunInternal(
			{
				commands: this.commands,
				config: this.config,
				db: this.db,
				heartbeatWatchers: this.heartbeatWatchers,
				hub: this.hub,
				onProjectChanged: this.onProjectChanged,
				onRunContinuation: this.continuation.onRunContinuation,
				resolveProjectPath: (path) => this.projectService.resolveProjectPath(path),
				rootDir: this.rootDir,
				tailWatchers: this.tailWatchers,
				telemetry: this.telemetryService,
			},
			input,
			options,
		);
	}

	// Launch a follow-up run for a continuation-eligible terminal run (Continue affordance).
	async continueRun(id: string): Promise<typeof runs.$inferSelect> {
		return this.continuation.continueRun(id);
	}

	async killRun(id: string): Promise<void> {
		return killRunInternal(this.controlContext(), id);
	}

	async stopRun(id: string): Promise<void> {
		return stopRunInternal(this.controlContext(), id);
	}

	async readOutput(id: string): Promise<RunOutputResult> {
		return readOutputInternal({ config: this.config, db: this.db, hub: this.hub }, id);
	}

	async ingestCompletedCliRuns(): Promise<number> {
		return ingestCompletedCliRunsInternal({
			commands: this.commands,
			config: this.config,
			db: this.db,
			onProjectChanged: this.onProjectChanged,
		});
	}

	async waitForTerminalStatus(
		runId: string,
		options: { pollIntervalMs?: number; timeoutMs?: number } = {},
	): Promise<WebRunStatus> {
		return waitForTerminalStatus((id) => this.getRun(id), runId, options);
	}

	private async ensureHeartbeatWatcher(projectPath: string): Promise<void> {
		await ensureRunHeartbeatWatcher(projectPath, this.heartbeatWatchers, {
			commands: this.commands,
			db: this.db,
			hub: this.hub,
			onProjectChanged: this.onProjectChanged,
			onRunContinuation: this.continuation.onRunContinuation,
			tailWatchers: this.tailWatchers,
			telemetry: this.telemetryService,
		});
	}

	private controlContext(): ControlContext {
		return {
			config: this.config,
			db: this.db,
			heartbeatWatchers: this.heartbeatWatchers,
			hub: this.hub,
			onProjectChanged: this.onProjectChanged,
			tailWatchers: this.tailWatchers,
			telemetry: this.telemetryService,
		};
	}
}
