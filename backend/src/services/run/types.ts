import type { CliActiveRunSource } from 'aidd-shared/metadata/active-runs';

import type { WebRunStatus } from '../../types.ts';

import { HttpError } from '../errors.ts';

export class RunControlError extends HttpError {
	constructor(message: string, status = 400) {
		super(message, status);
		this.name = 'RunControlError';
	}
}

export const TERMINAL_STATUSES: ReadonlySet<WebRunStatus> = new Set([
	'completed',
	'failed',
	'killed',
	'stopped',
	'waiting_approval',
]);

// Statuses a run can hold while detached child processes are still expected to be alive.
// At startup any row still in one of these states is reconciled against the on-disk
// heartbeat file: fresh records resume, missing/stale records are force-failed.
export const NON_TERMINAL_RUN_STATUSES: readonly WebRunStatus[] = ['running'];

// Exit-code sentinel recorded for runs force-failed by startup reconciliation or stale
// heartbeat detection — a single sentinel for "the supervising path believes the process
// died unexpectedly."
export const RECONCILED_EXIT_CODE = -1;

// Run sources whose lifecycle is mirrored into invocation telemetry. Direct-CLI runs never
// recorded a telemetry start, so their completion must not be force-closed against a row that
// does not exist. Shared by the heartbeat terminal paths and the in-session orphan sweep.
export const TELEMETRY_RUN_SOURCES: ReadonlySet<CliActiveRunSource> = new Set([
	'director',
	'scheduled',
	'web',
]);

export const DIRECTOR_PROJECT_NAME = 'Director';

export function canonicalRunProjectName(projectName: string, mode: string, source: string): string {
	return mode === 'director' && source === 'director' ? DIRECTOR_PROJECT_NAME : projectName;
}

export const RECENT_RUN_LOOKBACK_MS = 86_400_000;
export const INGEST_INTERVAL_MS = 30_000;

// Cadence of the in-session orphan sweep that force-fails runs whose process died before
// writing a heartbeat file (sweepOrphanedRuns). Matches the ingest cadence — both are
// best-effort background reconciliations with no latency-sensitive consumer.
export const ORPHAN_RUN_SWEEP_INTERVAL_MS = 30_000;
