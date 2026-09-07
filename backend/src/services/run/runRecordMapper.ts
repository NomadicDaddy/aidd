import type { BackendName } from 'aidd-shared/plan/types';

import { asRunInitiator } from 'aidd-shared/metadata/active-runs';
import { isAiddRunDriverKind } from 'aidd-shared/run-provenance';

import type { RunRecord, RunSource, WebRunMode, WebRunStatus } from '../../types.ts';
import type { WebRunRow } from './queryContracts.ts';

import { encodeProjectId } from '../../paths.ts';
import { storedOrReconstructedRunCommand } from './commandMetadata.ts';
import { annotateStopRequested } from './stopRequestedAnnotation.ts';
import { canonicalRunProjectName, TERMINAL_STATUSES } from './types.ts';

export function toWebRunRecord(run: WebRunRow): RunRecord {
	const status = run.status as WebRunStatus;
	const terminal = TERMINAL_STATUSES.has(status);
	return {
		// Liveness is a property of a running row only; null it for terminal runs so a finished
		// run never surfaces a frozen heartbeat/activity (the DB may retain the last value, but it
		// is inert tombstone data — this serializer is the single read chokepoint for every
		// terminal path: heartbeat completion, stop/kill, and boot reconciliation).
		activityState: terminal ? null : run.activityState,
		aiddDirty: run.aiddDirty,
		aiddRevision: run.aiddRevision,
		aiddVersion: run.aiddVersion,
		aiSummary: run.aiSummary,
		backend: run.backend as BackendName,
		canKill: !terminal,
		canReadOutput: run.logPath !== null,
		canStop: !terminal,
		chainedFromRunId: run.chainedFromRunId,
		completedAt: run.completedAt,
		// 'none' and NULL (not yet evaluated) both read as "no continuation offer".
		continuationReason:
			run.continuationReason === 'initializer_handoff' ||
			run.continuationReason === 'wall_clock_timeout'
				? run.continuationReason
				: null,
		driverId: run.driverId,
		driverKind: isAiddRunDriverKind(run.driverKind) ? run.driverKind : null,
		driverSha256: run.driverSha256,
		durationMs: run.durationMs,
		errorMessage: run.errorMessage,
		exitCode: run.exitCode,
		heartbeatAt: terminal ? null : run.heartbeatAt,
		id: run.id,
		initiator: asRunInitiator(run.initiator),
		launchCommand: storedOrReconstructedRunCommand(run.commandArgsJson, run),
		logPath: run.logPath,
		mode: run.mode as WebRunMode,
		model: run.model,
		pid: run.pid,
		pipelineSessionId: run.pipelineSessionId,
		projectId: encodeProjectId(run.projectPath),
		projectName: canonicalRunProjectName(run.projectName, run.mode, run.source),
		projectPath: run.projectPath,
		provider: run.provider,
		reasoningEffort: run.reasoningEffort,
		scheduledTaskExecutionId: run.scheduledTaskExecutionId,
		source: (run.source as RunSource) ?? 'web',
		startedAt: run.startedAt,
		status,
		stopReason: run.stopReason,
		// Derived from the project stop file by annotateStopRequested at the read chokepoints;
		// this serializer never sees the filesystem.
		stopRequested: false,
		summary: run.summary,
	};
}

// Single-row read surface (getRunRecord): serialize the row and derive its pending-stop flag in
// one step, mirroring what the list chokepoints do via annotateStopRequested.
export async function annotatedWebRunRecord(run: WebRunRow): Promise<RunRecord | undefined> {
	return (await annotateStopRequested([toWebRunRecord(run)]))[0];
}
