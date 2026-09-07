import type {
	DirectAiMeta,
	DirectorCycleInput,
	DirectorCycleRecord,
	DirectorCycleStage,
	DirectorOutput,
} from 'aidd-shared';
import type { RunInitiator } from 'aidd-shared/metadata/active-runs';

import { desc } from 'drizzle-orm';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebDatabase } from '../../db/client.ts';
import type { DbCommands } from '../../db/commands.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { DirectAiRunner } from '../directAiService.ts';
import type { CycleCollaborators } from './cycleDeps.ts';
import type { ActiveCycleState, DirectorConfigProvider, FleetSummary } from './types.ts';

import { directorCycles } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { HttpError } from '../errors.ts';
import { type RunService } from '../runService.ts';
import { type DirectorChatService } from './chatService.ts';
import { notifyChatSession, notifyChatSessionFailure } from './cycleChatNotify.ts';
import { buildExecutorDeps } from './cycleDeps.ts';
import { awaitAndPersistCycle, type CycleExecutorDeps, executeCycle } from './cycleExecutor.ts';
import { failCycle } from './cycleFailure.ts';
import { broadcastCycle, toCycleRecord } from './cyclePersistence.ts';
import { reconcileStaleCycles } from './cycleReconcile.ts';
import { type DirectorFleetSummaryService } from './fleetSummaryService.ts';
import { createCycleId } from './helpers.ts';
import { type DirectorProfileService } from './profileService.ts';

export const CYCLE_ALREADY_RUNNING = 'A Director cycle is already running.';

export class DirectorCycleService {
	private readonly activeStages = new Map<string, ActiveCycleState>();
	private readonly autoLaunchSuggestions: (cycleId: string) => Promise<void>;
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
		autoLaunchSuggestions: (cycleId: string) => Promise<void>;
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
		this.autoLaunchSuggestions = deps.autoLaunchSuggestions;
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
		const begun = await this.beginCycle(null, 'operator');
		if (begun.kind === 'busy') throw new HttpError(CYCLE_ALREADY_RUNNING, 409);
		const output = await this.runCycleBody(begun.cycleId, begun.directorCwd, input, 'operator');
		return { cycleId: begun.cycleId, output };
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
		const begun = await this.beginCycle(null, 'operator');
		if (begun.kind === 'busy') throw new HttpError(CYCLE_ALREADY_RUNNING, 409);
		this.launchInBackground(begun.cycleId, begun.directorCwd, input, 'operator');
		return { cycleId: begun.cycleId };
	}

	/**
	 * Start the cycle a scheduled occurrence is due to run, recording it as that occurrence's child.
	 *
	 * Unlike the operator-facing entry points this never throws when the fleet is busy: an
	 * occurrence that arrives while a cycle is still running is a skip, not a failure, and the
	 * caller records it that way.
	 * @param scheduledTaskExecutionId The occurrence claiming this cycle.
	 * @param initiator Who the occurrence's trigger says started it. A parameter rather than a
	 * constant 'automatic': Run now reaches this same method, and stamping every
	 * scheduler-launched cycle automatic would tell the suggestion auto-launcher that a person watching
	 * the cycle finish was nobody at all.
	 * @returns The started cycle's id, or the reason nothing was started.
	 */
	async startScheduledCycle(
		scheduledTaskExecutionId: string,
		initiator: RunInitiator,
	): Promise<{ cycleId: string } | { skipped: string }> {
		if (this.disposed) return { skipped: 'The control panel is shutting down.' };
		const begun = await this.beginCycle(scheduledTaskExecutionId, initiator);
		if (begun.kind === 'busy') {
			return { skipped: `${CYCLE_ALREADY_RUNNING} This occurrence was skipped.` };
		}
		this.launchInBackground(begun.cycleId, begun.directorCwd, {}, initiator);
		return { cycleId: begun.cycleId };
	}

	private launchInBackground(
		cycleId: string,
		directorCwd: string,
		input: DirectorCycleInput,
		initiator: RunInitiator,
	): void {
		void this.runCycleBody(cycleId, directorCwd, input, initiator).catch(
			async (error: unknown) => {
				webLogger.error({ cycleId, error }, 'Background director cycle failed');
				await notifyChatSessionFailure(
					this.chatService,
					cycleId,
					input.sessionId,
					error,
				).catch((notifyError: unknown) => {
					webLogger.error(
						{ cycleId, error: notifyError },
						'Failed to notify chat of cycle failure',
					);
				});
			},
		);
	}

	// A director cycle is fleet-wide and read-only with respect to project trees —
	// it builds its prompt from the fleet summary + context artifacts, not from any one
	// project's files. It therefore runs in a neutral, controlled cwd (data/director), independent
	// of project availability and foreign project git/encoding state.
	//
	// The row is inserted through the atomic idle gate rather than a plain insert, so the scheduled
	// occurrence, the Run Cycle button, and the chat tool cannot each pass their own check and stack
	// two cycles over one fleet. That running row is also the only liveness signal that survives a
	// restart, which is why no in-memory stage map is consulted here.
	private async beginCycle(
		scheduledTaskExecutionId: null | string,
		initiator: RunInitiator,
	): Promise<{ cycleId: string; directorCwd: string; kind: 'started' } | { kind: 'busy' }> {
		const cycleId = createCycleId();
		const directorCwd = this.cycleDir();
		await mkdir(directorCwd, { recursive: true });
		const aiddProvenance = await this.runService.resolveRunProvenance();
		const result = await this.commands.startDirectorCycleIfIdle({
			values: {
				...aiddProvenance,
				id: cycleId,
				initiator,
				scheduledTaskExecutionId,
				startedAt: Date.now(),
				status: 'running',
			},
		});
		if (result.kind === 'busy') {
			webLogger.info(
				{ cycleId: result.runningCycleId, scheduledTaskExecutionId },
				'Director cycle start refused; another cycle is already running',
			);
			return { kind: 'busy' };
		}
		return { cycleId, directorCwd, kind: 'started' };
	}

	private async runCycleBody(
		cycleId: string,
		directorCwd: string,
		input: DirectorCycleInput,
		initiator: RunInitiator,
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
				initiator,
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
		return buildExecutorDeps(this.collaborators());
	}

	private collaborators(): CycleCollaborators {
		return {
			autoLaunchSuggestions: this.autoLaunchSuggestions,
			chatService: this.chatService,
			commands: this.commands,
			db: this.db,
			deleteActiveStage: (id) => this.activeStages.delete(id),
			directAiService: this.directAiService,
			disposed: () => this.disposed,
			getConfig: this.getConfig,
			hub: this.hub,
			profileService: this.profileService,
			runService: this.runService,
			setCycleStage: (id, stage, meta) => this.setCycleStage(id, stage, meta ?? null),
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
