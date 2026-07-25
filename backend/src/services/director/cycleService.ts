import type {
	DirectAiMeta,
	DirectorCycleInput,
	DirectorCycleRecord,
	DirectorCycleStage,
	DirectorOutput,
} from 'aidd-shared';

import { desc } from 'drizzle-orm';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebDatabase } from '../../db/client.ts';
import type { DbCommands } from '../../db/commands.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { DirectAiRunner } from '../directAiService.ts';
import type { DirectorConfigProvider, DirectorOutputStatus, FleetSummary } from './types.ts';

import { directorCycles } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { type RunService } from '../runService.ts';
import { type DirectorChatService } from './chatService.ts';
import { awaitAndPersistCycle, type CycleExecutorDeps, executeCycle } from './cycleExecutor.ts';
import {
	broadcastCycle,
	type CyclePersistenceDeps,
	failCycle,
	notifyChatSession,
	notifyChatSessionFailure,
	persistCycleResult,
	readCycleOutput,
	toCycleRecord,
} from './cyclePersistence.ts';
import { reconcileStaleCycles } from './cycleReconcile.ts';
import { type ActiveCycleState, checkAndRunScheduledCycle } from './cycleScheduler.ts';
import { type DirectorFleetSummaryService } from './fleetSummaryService.ts';
import { createCycleId } from './helpers.ts';
import { type DirectorProfileService } from './profileService.ts';

// How often the auto-cycle scheduler re-evaluates staleness. The cadence is far
// finer than the (hours-scale) interval so a freshly enabled schedule or a changed
// interval takes effect within minutes without a restart; the actual gate is the
// per-tick staleness check against the configured interval.
const SCHEDULE_CHECK_INTERVAL_MS = 5 * 60_000;

export class DirectorCycleService {
	private readonly activeStages = new Map<string, ActiveCycleState>();
	private scheduleTimer: null | ReturnType<typeof setInterval> = null;
	private readonly db: WebDatabase;
	private readonly commands: DbCommands;
	private readonly getConfig: DirectorConfigProvider;
	private readonly hub: WebSocketHub;
	private readonly directAiService: DirectAiRunner;
	private readonly runService: RunService;
	private readonly profileService: DirectorProfileService;
	private readonly fleetSummaryService: DirectorFleetSummaryService;
	private readonly chatService: DirectorChatService;
	private disposed = false;

	constructor(deps: {
		chatService: DirectorChatService;
		commands: DbCommands;
		db: WebDatabase;
		directAiService: DirectAiRunner;
		fleetSummaryService: DirectorFleetSummaryService;
		getConfig: DirectorConfigProvider;
		hub: WebSocketHub;
		profileService: DirectorProfileService;
		runService: RunService;
	}) {
		this.db = deps.db;
		this.commands = deps.commands;
		this.getConfig = deps.getConfig;
		this.hub = deps.hub;
		this.directAiService = deps.directAiService;
		this.runService = deps.runService;
		this.profileService = deps.profileService;
		this.fleetSummaryService = deps.fleetSummaryService;
		this.chatService = deps.chatService;
	}

	// On web shutdown the cycle's in-process await loop stops, but the detached
	// CLI child it launched keeps running and continues writing the heartbeat
	// file. On the next start, reconcileStaleCycles re-attaches via the
	// director_cycle_id FK and resumes the persist step.
	markDisposed(): void {
		this.disposed = true;
		if (this.scheduleTimer !== null) {
			clearInterval(this.scheduleTimer);
			this.scheduleTimer = null;
		}
	}

	/**
	 * Begin the auto-cycle scheduler. Runs one immediate catch-up check (intended to
	 * fire after the web process has warmed up) so a fleet not analyzed within the
	 * configured interval starts a cycle on startup, then re-checks on a fixed cadence.
	 * Idempotent; the per-tick gate reads live config so toggling the setting or
	 * changing the interval takes effect without a restart.
	 */
	startScheduler(): void {
		if (this.scheduleTimer !== null || this.disposed) return;
		void this.checkAndRunScheduledCycle().catch((error: unknown) => {
			webLogger.warn({ error }, 'Initial scheduled director cycle check failed');
		});
		this.scheduleTimer = setInterval(() => {
			if (this.disposed) return;
			void this.checkAndRunScheduledCycle().catch((error: unknown) => {
				webLogger.warn({ error }, 'Scheduled director cycle check failed');
			});
		}, SCHEDULE_CHECK_INTERVAL_MS);
		this.scheduleTimer.unref?.();
	}

	// Start an automatic cycle when the auto-cycle setting is enabled and the most recent
	// cycle is older than the configured interval. Skips while a cycle is in flight
	// (in-process stage or a 'running' row from a detached/resumed cycle) so auto-runs
	// never stack.
	private async checkAndRunScheduledCycle(): Promise<void> {
		await checkAndRunScheduledCycle({
			activeStages: this.activeStages,
			db: this.db,
			disposed: this.disposed,
			getConfig: this.getConfig,
			startCycle: (input) => this.startCycle(input),
		});
	}

	async listCycles(): Promise<DirectorCycleRecord[]> {
		const rows = await this.db
			.select()
			.from(directorCycles)
			.orderBy(desc(directorCycles.startedAt))
			.limit(20);
		return rows.map((row) => toCycleRecord(row, this.getConfig, this.activeStages));
	}

	async reconcileStaleCycles(): Promise<void> {
		await reconcileStaleCycles({
			activeStages: this.activeStages,
			awaitAndPersistCycle: (cycleId, runId, outputPath, fleetSummary) =>
				this.awaitAndPersistCycle(cycleId, runId, outputPath, fleetSummary),
			db: this.db,
			executorDeps: () => this.executorDeps(),
			getConfig: this.getConfig,
			hub: this.hub,
			setCycleStage: (id, stage, meta) => this.setCycleStage(id, stage, meta ?? null),
		});
	}

	async runCycle(
		input: DirectorCycleInput = {},
	): Promise<{ cycleId: string; output: DirectorOutput | undefined }> {
		const { cycleId, directorCwd } = await this.beginCycle();
		const output = await this.runCycleBody(cycleId, directorCwd, input);
		return { cycleId, output };
	}

	/**
	 * Start a cycle without blocking the caller on its completion. The cycle row and id are created
	 * synchronously; the cycle body runs in the background and posts a completion (or failure)
	 * message into the chat session when it finishes. Used by the agentic chat `run_cycle` tool so a
	 * chat turn stays responsive.
	 * @param input
	 * @returns The cycle id.
	 */
	async startCycle(input: DirectorCycleInput = {}): Promise<{ cycleId: string }> {
		const { cycleId, directorCwd } = await this.beginCycle();
		void this.runCycleBody(cycleId, directorCwd, input).catch(async (error: unknown) => {
			webLogger.error({ cycleId, error }, 'Background director cycle failed');
			await notifyChatSessionFailure(this.chatService, cycleId, input.sessionId, error).catch(
				(notifyError: unknown) => {
					webLogger.error(
						{ cycleId, error: notifyError },
						'Failed to notify chat of cycle failure',
					);
				},
			);
		});
		return { cycleId };
	}

	// A director cycle is fleet-wide and read-only with respect to project trees —
	// it builds its prompt from the fleet summary + context artifacts, not from any one
	// project's files. It therefore runs in a neutral, controlled cwd (data/director), independent
	// of project availability and foreign project git/encoding state.
	private async beginCycle(): Promise<{ cycleId: string; directorCwd: string }> {
		const cycleId = createCycleId();
		const directorCwd = this.cycleDir();
		await mkdir(directorCwd, { recursive: true });
		const aiddProvenance = await this.runService.resolveRunProvenance();
		await this.db.insert(directorCycles).values({
			...aiddProvenance,
			id: cycleId,
			startedAt: Date.now(),
			status: 'running',
		});
		return { cycleId, directorCwd };
	}

	private async runCycleBody(
		cycleId: string,
		directorCwd: string,
		input: DirectorCycleInput,
	): Promise<DirectorOutput | undefined> {
		try {
			this.setCycleStage(cycleId, 'starting');
			this.setCycleStage(cycleId, 'preparing_fleet_summary');
			const fleetSummary = await this.fleetSummaryService.getFleetSummary();
			const cycleDir = this.cycleDir();
			await mkdir(cycleDir, { recursive: true });
			const fleetSummaryPath = join(cycleDir, `${cycleId}-fleet-summary.json`);
			await writeFile(fleetSummaryPath, `${JSON.stringify(fleetSummary, null, 2)}\n`);
			this.setCycleStage(cycleId, 'writing_context');

			const { cycleContext, output } = await executeCycle(
				this.executorDeps(),
				cycleId,
				cycleDir,
				fleetSummary,
				input,
				directorCwd,
			);
			await notifyChatSession(this.chatService, cycleId, cycleContext?.sessionId, output);
			return output;
		} catch (err) {
			await failCycle(this.db, this.hub, cycleId, err);
			throw err;
		} finally {
			this.activeStages.delete(cycleId);
		}
	}

	private async awaitAndPersistCycle(
		cycleId: string,
		runId: string,
		outputPath: string,
		fleetSummary: FleetSummary,
	): Promise<DirectorOutput | undefined> {
		return awaitAndPersistCycle(this.executorDeps(), cycleId, runId, outputPath, fleetSummary);
	}

	private executorDeps(): CycleExecutorDeps {
		return {
			chatService: this.chatService,
			db: this.db,
			deleteActiveStage: (id) => this.activeStages.delete(id),
			directAiService: this.directAiService,
			disposed: () => this.disposed,
			getConfig: this.getConfig,
			persistCycleResult: (
				id,
				fleet,
				output,
				exitCode,
				outputStatus: DirectorOutputStatus | undefined,
				failureReason,
			) =>
				persistCycleResult(
					this.persistenceDeps(),
					id,
					fleet,
					output,
					exitCode,
					outputStatus,
					failureReason,
				),
			profileService: this.profileService,
			readCycleOutput: (path) => readCycleOutput(path),
			runService: this.runService,
			setCycleStage: (id, stage, meta) => this.setCycleStage(id, stage, meta ?? null),
		};
	}

	private persistenceDeps(): CyclePersistenceDeps {
		return {
			chatService: this.chatService,
			commands: this.commands,
			db: this.db,
			getConfig: this.getConfig,
			hub: this.hub,
		};
	}

	private cycleDir(): string {
		return join(this.getConfig().web.dataDir, 'director');
	}

	private setCycleStage(
		cycleId: string,
		stage: DirectorCycleStage,
		directAiMeta: DirectAiMeta | null = null,
	): void {
		this.activeStages.set(cycleId, { directAiMeta, stage });
		broadcastCycle(this.hub, cycleId, 'running', stage, undefined, directAiMeta);
	}
}
