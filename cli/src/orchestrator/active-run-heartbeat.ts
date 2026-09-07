import type { AgentEvent } from 'aidd-shared/backends/types';
import type { ModeResult } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import {
	type CliActiveRunRecord,
	createCliActiveRunRecord,
	isCliActiveRunSuppressed,
	sweepStaleActiveRunTempFiles,
	writeCliActiveRunRecord,
} from 'aidd-shared/metadata/active-runs';
import { existsSync } from 'node:fs';

import type { RunFinalSummary, RunIterationArtifact, RunObserver } from './orchestrator.ts';
import type { OrchestratorState } from './state.ts';

import {
	appendFallbackRunSummary,
	type CliActiveRunHeartbeatOptions,
	HEARTBEAT_INTERVAL_MS,
	iterationSummary,
	shouldTrackRun,
	stateSummary,
	terminalStateFromStopReason,
} from './active-run-heartbeat-support.ts';
import { ActiveRunLog } from './active-run-log.ts';

export type { CliActiveRunHeartbeatOptions } from './active-run-heartbeat-support.ts';
export class CliActiveRunHeartbeat {
	readonly id: string;
	readonly observer: RunObserver;
	private fatalErrorMessage: null | string = null;
	private finalSummaryWritten = false;
	private readonly log: ActiveRunLog;
	private readonly projectStopFile: string;
	private record: CliActiveRunRecord;
	private readonly timer: ReturnType<typeof setInterval>;
	// Single-flight write queue: the 5s timer and the void-dispatched onState/onAgentEvent callbacks
	// all drive writeCliActiveRunRecord. Chaining every write off the previous one serializes them so
	// two writes never collide on the temp/rename path (Windows EPERM on concurrent renames).
	private writeChain: Promise<void> = Promise.resolve();
	private constructor(record: CliActiveRunRecord, log: ActiveRunLog, projectStopFile: string) {
		this.record = record;
		this.id = record.id;
		this.log = log;
		this.projectStopFile = projectStopFile;
		this.timer = setInterval(() => {
			void this.safeUpdate((current) => current);
		}, HEARTBEAT_INTERVAL_MS);
		this.timer.unref?.();
		this.observer = {
			onAgentEvent: (event) => {
				this.log.write(event);
				// Streamed deltas arrive at token rate; they feed the log tail only. Writing the
				// active-run record for each would hammer the temp/rename path for no new state.
				if (event.type === 'assistant_delta') return;
				return this.safeUpdateFromAgentEvent(event);
			},
			onFinalSummary: (summary) => this.safeFinalize(summary),
			onIteration: (artifact) => this.safeUpdateFromIteration(artifact),
			onModeResult: (result) => this.safeUpdateFromModeResult(result),
			onState: (state) => {
				void this.safeUpdateFromState(state);
			},
		};
	}

	static async start(
		plan: RunPlan,
		options: CliActiveRunHeartbeatOptions = {},
		env: NodeJS.ProcessEnv = process.env,
	): Promise<CliActiveRunHeartbeat | undefined> {
		if (!shouldTrackRun(plan, options.externalSource)) return undefined;
		if (!options.externalSource && isCliActiveRunSuppressed(env)) return undefined;
		const log = await ActiveRunLog.open(plan, options.logPath);
		const heartbeat = new CliActiveRunHeartbeat(
			createCliActiveRunRecord({
				...(options.aiddProvenance ? { aiddProvenance: options.aiddProvenance } : {}),
				backend: plan.backend,
				commandArgs: options.commandArgs ?? null,
				...(options.externalRunId ? { id: options.externalRunId } : {}),
				// Absent for a bare CLI invocation, which createCliActiveRunRecord reads as the
				// person at the terminal it is.
				...(options.externalInitiator ? { initiator: options.externalInitiator } : {}),
				logPath: options.logPath ?? null,
				mode: plan.mode,
				model: plan.model,
				projectDir: plan.projectDir,
				provider: plan.provider,
				reasoningEffort: plan.reasoningEffort,
				...(plan.driver ? { runDriver: plan.driver } : {}),
				...(options.externalSource ? { source: options.externalSource } : {}),
			}),
			log,
			plan.stopPolicy.projectStopFile,
		);
		await heartbeat.safeUpdate((current) => current);
		return heartbeat;
	}

	// Records why a crash-path dispose is happening so the terminal heartbeat carries the
	// failure instead of the last routine state summary. Set by installCrashFinalizer only.
	noteFatalError(message: string): void {
		this.fatalErrorMessage = message;
	}

	async dispose(): Promise<void> {
		clearInterval(this.timer);
		await this.safeDisposeFinalize();
		await this.log.close();
		// Reclaim any temp orphaned by a crashed prior run in this project; our own writes self-clean.
		await sweepStaleActiveRunTempFiles(this.record.projectPath).catch(() => {});
	}

	private enqueueWrite(record: CliActiveRunRecord): Promise<void> {
		const write = this.writeChain.then(() => writeCliActiveRunRecord(record));
		// Swallow on the chain so one failed write does not break serialization of later writes;
		// callers still observe the rejection via the returned promise.
		this.writeChain = write.catch(() => {});
		return write;
	}

	private async safeUpdateFromState(state: OrchestratorState): Promise<void> {
		await this.safeUpdate((current) => ({
			...current,
			state: state.type,
			summary: stateSummary(state) ?? current.summary,
		}));
	}

	private async safeUpdateFromAgentEvent(event: AgentEvent): Promise<void> {
		await this.safeUpdate((current) => ({
			...current,
			state: `agent:${event.type}`,
		}));
	}

	private async safeUpdateFromIteration(artifact: RunIterationArtifact): Promise<void> {
		await this.safeUpdate((current) => ({
			...current,
			state: 'iteration',
			summary: iterationSummary(artifact) ?? current.summary,
		}));
	}

	private async safeUpdateFromModeResult(result: ModeResult): Promise<void> {
		await this.safeUpdate((current) => ({
			...current,
			state: 'mode_result',
			summary: result.summary || current.summary,
		}));
	}

	private async safeFinalize(summary: RunFinalSummary): Promise<void> {
		clearInterval(this.timer);
		if (this.finalSummaryWritten) return;
		// Set the terminal flag before awaiting so any in-flight safeUpdate bails at its guard rather
		// than enqueueing a non-terminal write after the terminal one and overwriting it.
		this.finalSummaryWritten = true;
		const completedAt = Date.now();
		const terminalState = terminalStateFromStopReason(summary.stopReason);
		this.record = {
			...this.record,
			aiSummary: summary.aiSummary,
			// Output metrics ride the terminal heartbeat so the web layer can persist them on the
			// runs row without re-reading the ledger. Diffstat is null for commit-less runs; token
			// totals are always present in the final summary.
			cachedTokens: summary.totals.cachedTokens,
			completedAt,
			costUsd: summary.totals.costUsd > 0 ? summary.totals.costUsd : null,
			driverId: summary.driverId ?? this.record.driverId,
			driverKind: summary.driverKind ?? this.record.driverKind,
			driverSha256: summary.driverSha256 ?? this.record.driverSha256,
			durationMs: completedAt - this.record.startedAt,
			exitCode: summary.exitCode,
			filesChanged: summary.diffStat?.filesChanged ?? null,
			heartbeatAt: completedAt,
			inputTokens: summary.totals.inputTokens,
			linesAdded: summary.diffStat?.insertions ?? null,
			linesRemoved: summary.diffStat?.deletions ?? null,
			outputTokens: summary.totals.outputTokens,
			reasoningTokens: summary.totals.reasoningTokens,
			state: terminalState,
			stopReason: summary.stopReason,
			summary: summary.summary,
		};
		try {
			await this.enqueueWrite(this.record);
		} catch {
			// Heartbeat metadata must not change the outcome of the CLI run.
		}
		await this.log.close();
	}

	private async safeDisposeFinalize(): Promise<void> {
		if (this.finalSummaryWritten) return;
		this.finalSummaryWritten = true;
		const completedAt = Date.now();
		const stopRequested = existsSync(this.record.stopFile) || existsSync(this.projectStopFile);
		this.record = {
			...this.record,
			// Crash/dispose paths leave aiSummary null by construction.
			aiSummary: null,
			completedAt,
			durationMs: completedAt - this.record.startedAt,
			exitCode: this.record.exitCode ?? (stopRequested ? 130 : 1),
			heartbeatAt: completedAt,
			state: stopRequested ? 'stopped' : 'failed',
			stopReason: stopRequested ? 'stop_requested' : 'process_exit',
			// A crash reason beats both the last routine state summary and the generic
			// fallback — it is what the operator needs to see on the failed run row.
			summary:
				this.fatalErrorMessage ??
				this.record.summary ??
				(stopRequested
					? 'run stopped before final summary'
					: 'run ended before final summary'),
		};
		try {
			await this.enqueueWrite(this.record);
			await appendFallbackRunSummary(this.record);
		} catch {
			// Heartbeat metadata must not change the outcome of the CLI run.
		}
	}

	private async safeUpdate(
		update: (record: CliActiveRunRecord) => CliActiveRunRecord,
	): Promise<void> {
		if (this.finalSummaryWritten) return;
		try {
			this.record = {
				...update(this.record),
				heartbeatAt: Date.now(),
			};
			await this.enqueueWrite(this.record);
		} catch {
			// Heartbeat metadata must not change the outcome of the CLI run.
		}
	}
}
