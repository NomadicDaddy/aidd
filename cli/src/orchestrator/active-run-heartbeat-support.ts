import type { RunPlan } from 'aidd-shared/plan/types';
import type { AiddRunProvenance } from 'aidd-shared/run-provenance';

import {
	asRunInitiator,
	type CliActiveRunRecord,
	type CliActiveRunSource,
	EXT_LOG_PATH_ENV,
	EXT_RUN_ID_ENV,
	EXT_RUN_INITIATOR_ENV,
	EXT_RUN_SOURCE_ENV,
	type RunInitiator,
} from 'aidd-shared/metadata/active-runs';
import { metadataPath } from 'aidd-shared/metadata/paths';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { RunIterationArtifact } from './orchestrator.ts';
import type { OrchestratorState } from './state.ts';

export const HEARTBEAT_INTERVAL_MS = 5000;

export interface CliActiveRunHeartbeatOptions {
	aiddProvenance?: AiddRunProvenance;
	commandArgs?: null | readonly string[];
	externalInitiator?: RunInitiator;
	externalRunId?: string;
	externalSource?: CliActiveRunSource;
	logPath?: null | string;
	webDataDir?: string;
}

export function errorSummary(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function stateSummary(state: OrchestratorState): null | string {
	if (state.type === 'complete') return state.summary;
	if (state.type === 'stopped') return state.reason;
	if (state.type === 'failed') return errorSummary(state.error);
	return null;
}

export function iterationSummary(artifact: RunIterationArtifact): null | string {
	const summary = artifact.structured.summary;
	return typeof summary === 'string' && summary.trim().length > 0 ? summary : null;
}

export function shouldTrackRun(
	plan: RunPlan,
	externalSource: CliActiveRunSource | undefined,
): boolean {
	if (externalSource) return true;
	return !(plan.checks.artifacts || plan.checks.features);
}

// Process-based backends (codex, claude-code) only begin emitting `raw_log` chunks once the
// backend produces its first output, so the run log can be 0 bytes during the spawn-to-first-output
// window while the run is alive. Seed the log with one status line so `state: 'empty'` does not make
// the web Runs console look terminal; the incremental raw_log chunks then stream in on top of this
// seed. The native backend renders structured events directly and never needs this.
export function nonNativeRunLogIntro(plan: RunPlan): string {
	return `[aidd] ${plan.backend} run started — streaming output will appear here as ${plan.backend} produces it…\n`;
}

export function terminalStateFromStopReason(stopReason: string): string {
	// wall_clock_budget is a deliberate exit-0 stop taken *before* the deadline, not a failure —
	// the run declined an iteration it could not finish. Falling through to 'failed' would have
	// marked a clean stop as a failed run and (via the continuation rule) denied it a follow-up.
	if (
		stopReason === 'completed' ||
		stopReason === 'no_work' ||
		stopReason === 'wall_clock_budget'
	)
		return 'completed';
	if (stopReason === 'stop_requested') return 'stopped';
	if (stopReason === 'merge_conflict_parked' || stopReason === 'metadata_conflict_parked') {
		return 'waiting_approval';
	}
	return 'failed';
}

export async function appendFallbackRunSummary(record: CliActiveRunRecord): Promise<void> {
	const ledgerPath = metadataPath(record.projectPath, 'runs.jsonl');
	await mkdir(dirname(ledgerPath), { recursive: true });
	await appendFile(
		ledgerPath,
		`${JSON.stringify({
			aiddDirty: record.aiddDirty,
			aiddRevision: record.aiddRevision,
			aiddVersion: record.aiddVersion,
			aiSummary: null,
			backend: record.backend,
			commitsCreated: [],
			completedFeatures: [],
			durationMs: record.durationMs,
			endedAt: new Date(record.completedAt ?? record.heartbeatAt).toISOString(),
			exitCode: record.exitCode,
			fallbackSummary: true,
			fileChangePathsTruncated: false,
			filesCreated: [],
			filesEdited: [],
			mode: record.mode,
			model: record.model,
			provider: record.provider,
			reasoningEffort: record.reasoningEffort,
			runId: record.id,
			runLedgerDirty: true,
			scopeOverrun: false,
			selectedFeatures: [],
			source: record.source,
			startedAt: new Date(record.startedAt).toISOString(),
			stopReason: record.stopReason,
			summary: record.summary,
			toolBreakdown: {},
			totals: {
				cachedTokens: 0,
				commitsCreated: 0,
				costUsd: 0,
				errors: record.exitCode === 0 ? 0 : 1,
				filesCreated: 0,
				filesEdited: 0,
				idleWarnings: 0,
				inputTokens: 0,
				iterations: 0,
				outputTokens: 0,
				rateLimits: 0,
				reasoningTokens: 0,
				toolCalls: 0,
			},
		})}\n`,
	);
}

/** What a launcher handed this process about the run it is already tracking. */
export interface ExternalRunContext {
	initiator?: RunInitiator;
	logPath?: string;
	runId?: string;
	source?: CliActiveRunSource;
}

/**
 * Read the launcher's handoff out of the environment.
 *
 * Source stays narrowed to the two surfaces that actually spawn a detached CLI child; 'scheduled'
 * reaches the row through the launcher, not through this variable. The initiator is read
 * separately rather than derived from the source because that is the whole point of the field: a
 * 'web' child can be a run somebody launched or an auto-chained follow-up, and only the launcher
 * knows which.
 */
export function resolveExternalRunContext(
	env: NodeJS.ProcessEnv = process.env,
): ExternalRunContext {
	const source = env[EXT_RUN_SOURCE_ENV];
	const initiator = asRunInitiator(env[EXT_RUN_INITIATOR_ENV]);
	const runId = env[EXT_RUN_ID_ENV];
	const logPath = env[EXT_LOG_PATH_ENV];
	return {
		...(initiator ? { initiator } : {}),
		...(logPath ? { logPath } : {}),
		...(runId ? { runId } : {}),
		...(source === 'web' || source === 'director' ? { source } : {}),
	};
}
