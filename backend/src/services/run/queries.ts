import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import type { BackendName } from 'aidd-shared/plan/types';

import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { DbCommands } from '../../db/commands.ts';
import type { RunRecord, RunSource, WebRunMode, WebRunStatus } from '../../types.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';

import { runs } from '../../db/schema.ts';
import { encodeProjectId } from '../../paths.ts';
import { storedOrReconstructedRunCommand } from './commandMetadata.ts';
import { annotateStopRequested } from './stopRequestedAnnotation.ts';
import { canonicalRunProjectName, TERMINAL_STATUSES } from './types.ts';

export type WebRunRow = typeof runs.$inferSelect;

export interface QueriesContext {
	commands: DbCommands;
	config: ResolvedConfig & { web: ResolvedWebConfig };
	db: WebDatabase;
	hub: WebSocketHub;
	onProjectChanged?: (projectPath: string) => void;
}

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
		durationMs: run.durationMs,
		errorMessage: run.errorMessage,
		exitCode: run.exitCode,
		heartbeatAt: terminal ? null : run.heartbeatAt,
		id: run.id,
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

export async function getRun(
	db: WebDatabase,
	id: string
): Promise<typeof runs.$inferSelect | undefined> {
	return (await db.select().from(runs).where(eq(runs.id, id)).limit(1))[0];
}

// Single-row read surface (getRunRecord): serialize the row and derive its pending-stop flag in
// one step, mirroring what the list chokepoints do via annotateStopRequested.
export async function annotatedWebRunRecord(run: WebRunRow): Promise<RunRecord | undefined> {
	return (await annotateStopRequested([toWebRunRecord(run)]))[0];
}

// Re-export from domain modules so runService.ts can import every query
// function from this single module.
export { annotateStopRequested };
export {
	reconcileStaleRuns,
	sweepOrphanedRuns,
	type ResumeRunInfo,
	type SweptRunInfo,
} from './activeRunQueries.ts';
export {
	hasActiveRunForProject,
	latestProjectAuditRun,
	listRuns,
	listRunsForProject,
	listRunsForProjectPage,
	listRunsPage,
	type ListRunsPageOptions,
	purgeProjectRuns,
	updateProjectPathReferences,
} from './historyQueries.ts';
export {
	listActiveRunSummaries,
	type ProjectActiveRunSummary,
} from './projectActiveRunSummaries.ts';
