import type { DirectorSuggestion } from 'aidd-shared';
import type {
	ScheduledExecutionStatus,
	ScheduledExecutionTrigger,
	ScheduledTaskProjectScope,
} from 'aidd-shared/contracts/scheduled-tasks';
import type { CliActiveRunRecord } from 'aidd-shared/metadata/active-runs';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

import type { RunContinuationValue, WebRunStatus } from '../../types.ts';
import type * as schema from '../schema.ts';

import { type directorCycles, type runs } from '../schema.ts';

// The local, in-process bun:sqlite drizzle instance. Command scripts run against this — never
// against the main-thread sqlite-proxy `WebDatabase` — because their interactive read-modify-
// write logic must execute atomically inside a single BEGIN…COMMIT on one connection. In
// production that connection lives in the DB worker; in tests it is the in-memory database.
export type LocalWebDatabase = BunSQLiteDatabase<typeof schema>;
export type LocalTransaction = Parameters<Parameters<LocalWebDatabase['transaction']>[0]>[0];

export type WebRunRow = typeof runs.$inferSelect;

// Result of the atomic read-modify-write that terminalize/markStale commit. The transaction
// only decides and writes; side effects (broadcasts, telemetry, heartbeat-file cleanup) run on
// the main thread afterwards, keyed off which branch fired.
export type HeartbeatWriteOutcome =
	{ existing: WebRunRow; kind: 'updated' } | { kind: 'already-terminal' } | { kind: 'inserted' };

export interface TerminalizeRunArgs {
	completedAt: number;
	/** Continuation eligibility evaluated by the caller (heartbeat + ledger facts) before the
	 * transaction, persisted atomically with the terminal transition. */
	continuationValue: RunContinuationValue;
	durationMs: number;
	finalStatus: WebRunStatus;
	record: CliActiveRunRecord;
}

export interface MarkRunStaleArgs {
	completedAt: number;
	errorMessage: string;
	record: CliActiveRunRecord;
}

export interface ReconcileDeadRunArgs {
	completedAt: number;
	errorMessage: string;
	exitCode: number;
	runId: string;
	stopReason: string;
}

export interface ReconcileInvocationFromRunArgs {
	runId: string;
}

// One scanned diary entry, ready to upsert. Plain JSON so it survives the structured-clone
// boundary to the DB worker unchanged.
export interface DiaryEntryUpsert {
	bodyMd: string;
	contentHash: string;
	entryDate: string;
	fileMtimeMs: number;
	filePath: string;
	generatedBy: null | string;
	id: string;
	phase: null | string;
	projectName: string;
	projectPath: string;
	summary: null | string;
	title: string;
}

export interface ReconcileDiaryEntriesArgs {
	entries: DiaryEntryUpsert[];
	now: number;
	projectPath: string;
}

export interface ReconcileDiaryEntriesResult {
	deleted: number;
	unchanged: number;
	upserted: number;
}

export interface UpdateProjectPathArgs {
	destinationPath: string;
	projectName: string;
	sourcePath: string;
}

export interface PurgeProjectRunsArgs {
	projectPath: string;
}

export interface InsertRunIfUnderCeilingArgs {
	/** Maximum number of non-terminal runs allowed across all projects. */
	maxConcurrentRuns: number;
	/** Maximum number of non-terminal runs allowed for the row's projectPath. */
	maxConcurrentRunsPerProject: number;
	/** Full row values to insert if the ceiling has not been reached. */
	values: typeof runs.$inferInsert;
}

export type InsertRunIfUnderCeilingResult =
	| { activeCount: number; kind: 'rejected'; limit: number; scope: 'global' | 'project' }
	| { kind: 'inserted' };

export interface PersistCycleResultArgs {
	/**
	 * The durable auto-launch decision to commit alongside the cycle's terminal update, or absent
	 * where the caller records none. Applied only to a completed cycle an automatic initiator
	 * started, which the command establishes from the row itself rather than trusting the caller.
	 *
	 * This is what makes "the cycle finished and is owed a dispatch" survive a restart: it is
	 * written in the same transaction as the suggestions, so there is no window in which the
	 * suggestions exist and the obligation to consider them does not.
	 */
	autoLaunchDecision?: { bounds: string; state: 'disabled' | 'pending' } | null;
	createdAt: number;
	cycleId: string;
	cycleUpdate: {
		completedAt: number;
		failureReason: null | string;
		fleetHealthScore: number;
		status: 'completed' | 'failed';
		totalSuggestions: number;
	};
	/** Window during which a user-dismissed (dismissedBy='user') suggestion suppresses an
	 * identical re-suggestion. 0 disables dedup. */
	dedupWindowMs: number;
	// Empty for a failed cycle; the caller decides whether to persist suggestions.
	suggestions: DirectorSuggestion[];
}

export interface PersistCycleResultOutcome {
	inserted: number;
	suppressed: number;
}

export interface StartDirectorCycleIfIdleArgs {
	values: typeof directorCycles.$inferInsert;
}

export type StartDirectorCycleIfIdleResult =
	{ kind: 'busy'; runningCycleId: string } | { kind: 'started' };

export interface ClaimScheduledTaskArgs {
	executionId: string;
	expectedDueAt: null | number;
	nextRunAt: null | number;
	now: number;
	// Resolved projects for an 'all' scope claim. Null for 'explicit' (the stored rows are used)
	// and for 'none' (there are no projects).
	projectPaths: null | string[];
	// The scope the caller resolved projects for. A claim whose task was re-scoped underneath it is
	// abandoned rather than dispatched against the wrong shape.
	projectScope: ScheduledTaskProjectScope;
	taskId: string;
	trigger: ScheduledExecutionTrigger;
}

export type ClaimScheduledTaskResult =
	| {
			dueAt: number;
			executionId: string;
			kind: 'claimed';
			projectPaths: string[];
			projectScope: ScheduledTaskProjectScope;
			targetJson: string;
	  }
	| {
			dueAt: number;
			executionId: string;
			kind: 'skipped';
			projectPaths: string[];
			projectScope: ScheduledTaskProjectScope;
			targetJson: string;
	  }
	| { kind: 'active' }
	| { kind: 'missing' };

export interface FinishScheduledExecutionArgs {
	childrenJson: string;
	completedAt: number;
	dispatchErrorsJson: string;
	executionId: string;
	status: Exclude<ScheduledExecutionStatus, 'queued' | 'running'>;
}

export interface WriteScheduledTaskArgs {
	createdAt: number;
	id: string;
	name: string;
	nextRunAt: null | number;
	projectPaths: string[];
	projectScope: ScheduledTaskProjectScope;
	scheduleExpression: string;
	scheduleKind: 'cron' | 'once';
	state: 'active' | 'completed' | 'paused';
	// Written on insert only. An update never touches it, so an ordinary edit cannot create or
	// erase a built-in task.
	systemKey: null | string;
	targetJson: string;
	targetType: 'audit' | 'director' | 'recipe' | 'skill';
	timezone: string;
	updatedAt: number;
}

export interface SetRunPidArgs {
	pid: number;
	runId: string;
}

export interface ReleaseRunReservationArgs {
	runId: string;
}

// Maps each command name to its argument and result types. The single source of truth for the
// in-process facade, the worker dispatch, and the main-thread RPC client.
export interface DbCommandMap {
	claimScheduledTask: { args: ClaimScheduledTaskArgs; result: ClaimScheduledTaskResult };
	finishScheduledExecution: { args: FinishScheduledExecutionArgs; result: void };
	insertRunIfUnderCeiling: {
		args: InsertRunIfUnderCeilingArgs;
		result: InsertRunIfUnderCeilingResult;
	};
	markRunStale: { args: MarkRunStaleArgs; result: HeartbeatWriteOutcome };
	persistCycleResult: { args: PersistCycleResultArgs; result: PersistCycleResultOutcome };
	purgeProjectRuns: { args: PurgeProjectRunsArgs; result: number };
	reconcileDeadRun: { args: ReconcileDeadRunArgs; result: HeartbeatWriteOutcome };
	reconcileDiaryEntries: { args: ReconcileDiaryEntriesArgs; result: ReconcileDiaryEntriesResult };
	reconcileInvocationFromRun: { args: ReconcileInvocationFromRunArgs; result: number };
	reconcileStaleInvocations: { args: { now: number }; result: number };
	releaseRunReservation: { args: ReleaseRunReservationArgs; result: number };
	setRunPid: { args: SetRunPidArgs; result: number };
	startDirectorCycleIfIdle: {
		args: StartDirectorCycleIfIdleArgs;
		result: StartDirectorCycleIfIdleResult;
	};
	terminalizeRun: { args: TerminalizeRunArgs; result: HeartbeatWriteOutcome };
	updateProjectPathReferences: { args: UpdateProjectPathArgs; result: void };
	writeScheduledTask: { args: WriteScheduledTaskArgs; result: void };
}

export type DbCommandName = keyof DbCommandMap;

// The facade services call. Every method is async so the in-process and worker-backed
// implementations are interchangeable behind one type.
export type DbCommands = {
	[K in DbCommandName]: (args: DbCommandMap[K]['args']) => Promise<DbCommandMap[K]['result']>;
};
