import type { BackendName } from 'aidd-shared/plan/types';

import { type CliActiveRunRecord, isCliRunTerminal } from 'aidd-shared/metadata/active-runs';

import type { RunRecord, WebRunMode, WebRunStatus } from '../../types.ts';

import { canonicalProjectPath, encodeProjectId } from '../../paths.ts';
import { exactOrReconstructedRunCommand } from './commandMetadata.ts';
import { canonicalRunProjectName } from './types.ts';

// Path comparison and CLI-record → web-record mapping helpers for CLI active runs. Split out of
// cliActiveRuns.ts so the orchestration (scan/list/stop/kill) and the pure record shaping live in
// separate, headroom-having modules.

function normalizeComparablePath(path: string): string {
	const normalized = path.replaceAll('/', '\\');
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function pathsMatch(left: string, right: string): boolean {
	return normalizeComparablePath(left) === normalizeComparablePath(right);
}

export function cliRunWebStatus(run: CliActiveRunRecord): WebRunStatus {
	if (!isCliRunTerminal(run)) return 'running';
	return run.state === 'completed' ? 'completed' : run.state === 'stopped' ? 'stopped' : 'failed';
}

export function toCliRunRecord(run: CliActiveRunRecord): RunRecord {
	const terminal = isCliRunTerminal(run);
	const status = cliRunWebStatus(run);
	// The heartbeat carries the shell's spelling; the record and its project id use the canonical
	// one so the run sits under the same project as a web launch of the same directory.
	const projectPath = canonicalProjectPath(run.projectPath);
	return {
		// Liveness applies to running rows only; suppress it for terminal CLI runs (mirrors
		// toWebRunRecord) so a finished run never shows a frozen heartbeat/activity.
		activityState: terminal ? null : run.state,
		aiddDirty: run.aiddDirty,
		aiddRevision: run.aiddRevision,
		aiddVersion: run.aiddVersion,
		aiSummary: run.aiSummary,
		backend: run.backend as BackendName,
		// A non-terminal CLI run is killable: Kill terminates a live process tree and force-drives
		// a stranded row (dead/missing process) to a terminal status instead of leaving the button
		// permanently disabled. Mirrors the DB-backed run capability (queries.ts toWebRunRecord).
		canKill: !terminal,
		canReadOutput: run.logPath !== null,
		canStop: !terminal,
		// CLI heartbeat records carry no continuation metadata; the DB row (terminalize/ingest)
		// is where eligibility is evaluated and surfaced.
		chainedFromRunId: null,
		completedAt: run.completedAt,
		continuationReason: null,
		driverId: run.driverId,
		driverKind: run.driverKind,
		driverSha256: run.driverSha256,
		durationMs: run.durationMs,
		errorMessage: null,
		exitCode: run.exitCode,
		heartbeatAt: terminal ? null : run.heartbeatAt,
		id: run.id,
		initiator: run.initiator,
		launchCommand: exactOrReconstructedRunCommand(run.commandArgs, run),
		logPath: run.logPath,
		mode: run.mode as WebRunMode,
		model: run.model,
		pid: run.pid,
		pipelineSessionId: null,
		projectId: encodeProjectId(projectPath),
		projectName: canonicalRunProjectName(run.projectName, run.mode, run.source),
		projectPath,
		provider: run.provider,
		reasoningEffort: run.reasoningEffort,
		scheduledTaskExecutionId: null,
		source: run.source,
		startedAt: run.startedAt,
		status,
		stopReason: run.stopReason,
		// Derived from the project stop file by annotateStopRequested at the read chokepoints —
		// the heartbeat record's own `state` is overwritten by the CLI's next write, so stop-file
		// existence is the durable signal.
		stopRequested: false,
		summary: run.summary,
	};
}
