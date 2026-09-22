import type { AiddRunDriverKind } from 'aidd-shared/run-provenance';
import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import type { LaunchTargetValue } from './launchDefaults.ts';
import type { BackendInputName, BackendName } from './skills.ts';

// Mirrors backend WebRunMode (backend/src/types/run.ts) and the ck_runs_mode CHECK constraint.
// 'directive' is filterable and user-launchable through its dedicated operator route, but stays
// out of the generic RunLaunchCard mode selector.
export type RunMode =
	| 'audit'
	| 'coding'
	| 'directive'
	| 'director'
	| 'interview'
	| 'todo'
	| 'triumvirate'
	| 'validate';

export type RunStatus =
	'completed' | 'failed' | 'killed' | 'queued' | 'running' | 'stopped' | 'waiting_approval';

export type RunSource = 'cli' | 'director' | 'scheduled' | 'web';

/**
 * Whether a person asked for this run, or aidd started it on its own. Mirrors the backend
 * RunInitiator (shared/src/metadata/active-runs/provenance.ts). `source` cannot answer this: the
 * same door carries both — a 'web' run is a Launch click or an auto-chained follow-up, a
 * 'director' run is a Run Cycle click or a scheduled sweep.
 */
export type RunInitiator = 'automatic' | 'operator';

/** Why a terminal coding run supports a one-click follow-up launch (backend RunContinuationReason). */
export type RunContinuationReason = 'initializer_handoff' | 'wall_clock_timeout';

export interface RunLaunchCommand {
	args: string[];
	display: string;
	source: 'exact' | 'reconstructed';
}

export type PipelineSessionStatus =
	'completed_with_failures' | 'completed' | 'failed' | 'queued' | 'running' | 'stopped';

export type PipelineStepPhase = 'post-hook' | 'pre-hook' | 'step';

/**
 * What kind of attempt a persisted step row is: an ordinary dispatch (the first one and every
 * retry after it) or the auto-fix run launched between two ordinary attempts. `phase` cannot carry
 * this — it reads 'step' on both.
 */
export type PipelineStepAttemptKind = 'auto-fix' | 'ordinary';

export type PipelineStepStatus =
	'completed' | 'failed' | 'queued' | 'running' | 'skipped' | 'stopped';

export interface PipelineExecutionIdentity {
	backend: null | string;
	model: null | string;
	provider: null | string;
	reasoningEffort: null | string;
}

export interface PipelineActiveTopLevelStep {
	sequenceNumber: number;
	stepName: string;
}

export type RecipeStepOnFailure = 'auto-fix' | 'continue' | 'stop';

export type RecipeStepType = 'aidd-cli' | 'recipe-ref' | 'shell' | 'skill';

export type RunOutputState = 'cli-only' | 'empty' | 'ok' | 'unavailable';

export interface RunOutputWindowRequest {
	endByte: number;
	startByte: number;
}

export interface RunOutputResponse {
	/** Exclusive byte offset after the final returned byte. */
	endByte?: number;
	/** Who caused the run this transcript belongs to; absent from an older backend's payload. */
	initiator?: null | RunInitiator;
	output: string;
	reason: null | string;
	/** Inclusive byte offset of the first returned byte. */
	startByte?: number;
	state: RunOutputState;
	/** Size of the full transcript on disk in bytes; may exceed `output.length` when truncated. */
	totalBytes?: number;
	/** True when `output` is only the trailing window of a transcript larger than the server cap. */
	truncated?: boolean;
	/** Maximum byte span accepted by one output request. */
	windowLimitBytes?: number;
}

/** Unified active-run row for web-supervised subprocesses and CLI heartbeat metadata. */
export interface RunRecord {
	activityState: null | string;
	aiddDirty: boolean | null;
	aiddRevision: null | string;
	aiddVersion: null | string;
	aiSummary: null | string;
	backend: BackendName;
	canKill: boolean;
	canReadOutput: boolean;
	canStop: boolean;
	/** Run this one was launched to continue (Continue affordance / auto-chain), if any. */
	chainedFromRunId: null | string;
	completedAt: null | number;
	/** Non-null when this terminal run supports a one-click follow-up launch. */
	continuationReason: null | RunContinuationReason;
	driverId: null | string;
	driverKind: AiddRunDriverKind | null;
	driverSha256: null | string;
	durationMs: null | number;
	errorMessage: null | string;
	exitCode: null | number;
	heartbeatAt: null | number;
	id: string;
	/**
	 * Who caused this run. Null when nothing was recorded — render that as
	 * unknown, never as operator-initiated.
	 */
	initiator: null | RunInitiator;
	launchCommand: null | RunLaunchCommand;
	logPath: null | string;
	mode: RunMode;
	model: null | string;
	pid: null | number;
	pipelineSessionId: null | string;
	projectId: string;
	projectName: string;
	projectPath: string;
	provider: null | string;
	reasoningEffort: null | string;
	scheduledTaskExecutionId?: null | string;
	source: RunSource;
	startedAt: number;
	status: RunStatus;
	stopReason: null | string;
	/** True while a running run has a pending stop request (graceful wind-down). Compare with
	 * `=== true` — a payload from an older backend may omit the field. */
	stopRequested: boolean;
	summary: null | string;
}

export interface RunLaunchRequest {
	auditAll?: boolean;
	auditFindings?: boolean;
	auditFindingsSource?: string;
	auditNames?: string[];
	backend?: BackendInputName;
	checkArtifacts?: boolean;
	execBackend?: BackendInputName;
	execModel?: string;
	extraArgs?: string;
	feature?: string;
	filterBy?: string;
	filterValue?: string;
	interview?: boolean;
	maxIterations?: number;
	mode?: RunMode;
	model?: string;
	overseerBackend?: BackendInputName;
	overseerModel?: string;
	pipelineSessionId?: string;
	projectDir: string;
	prompt?: string;
	reasoningEffort?: string;
	secondaryBackend?: BackendInputName;
	secondaryModel?: string;
	simulation?: boolean;
	validate?: boolean;
}

export interface DirectiveRunLaunchRequest extends LaunchTargetValue {
	executionIntent: SkillExecutionIntent;
	projectDir: string;
	prompt: string;
}

export interface RecipeParameterDefinition {
	defaultValue?: string;
	description?: string;
	name: string;
}

export type RecipeConfigValue =
	{ [key: string]: RecipeConfigValue } | boolean | null | number | RecipeConfigValue[] | string;

export interface RecipeStepDefinition {
	configJson: Record<string, RecipeConfigValue>;
	id: string;
	name: string;
	onFailure?: RecipeStepOnFailure;
	postHookJson?: Record<string, RecipeConfigValue>;
	preHookJson?: Record<string, RecipeConfigValue>;
	retryCount?: number;
	stepType: RecipeStepType;
	when?: { equals: string; parameter: string };
}

export interface RecipeDefinition {
	description?: string;
	id: string;
	metadataOnly?: boolean;
	name: string;
	parameters: RecipeParameterDefinition[];
	steps: RecipeStepDefinition[];
	system?: boolean;
}

export interface PipelineSessionRecord {
	activeTopLevelStep: null | PipelineActiveTopLevelStep;
	completedAt: null | number;
	completedTopLevelSteps: number;
	durationMs: null | number;
	errorMessage: null | string;
	executionIdentities: PipelineExecutionIdentity[];
	id: string;
	parametersJson: string;
	/**
	 * How many of this session's runs parked their feature instead of completing it. Non-zero on a
	 * session whose every step succeeded, which is the point: it qualifies a green session that is
	 * not actually finished.
	 */
	parkedWorkRuns: number;
	projectName: string;
	projectPath: string;
	recipeId: string;
	recipeName: string;
	recipeSha256: null | string;
	scheduledTaskExecutionId?: null | string;
	/**
	 * Top-level steps that were recorded as skipped instead of running: a `when` condition that did
	 * not match, or the steps after a coding step that found no work. Counted apart from
	 * `completedTopLevelSteps`, which stays a count of steps that actually ran, so a session that
	 * ended early reads as "1 of 4 completed, 3 skipped" rather than as a stalled one.
	 */
	skippedTopLevelSteps: number;
	startedAt: number;
	status: PipelineSessionStatus;
	totalSteps: number;
}

export interface PipelineStepResultRecord {
	/** NULL on rows that are not attempts (hooks, skipped steps) and on rows written before 0003. */
	attemptKind: null | PipelineStepAttemptKind;
	/** One-based ordinal within the logical step. NULL wherever `attemptKind` is NULL. */
	attemptNumber: null | number;
	completedAt: null | number;
	depth: number;
	displayOrder: number;
	durationMs: null | number;
	errorMessage: null | string;
	executionIdentity: null | PipelineExecutionIdentity;
	exitCode: null | number;
	id: string;
	outputSummary: null | string;
	parentStepResultId: null | string;
	phase: PipelineStepPhase;
	runId: null | string;
	sequenceNumber: number;
	sessionId: string;
	startedAt: null | number;
	status: PipelineStepStatus;
	stepDefinitionId: null | string;
	stepName: string;
	stepType: 'hook' | RecipeStepType;
}

export interface PipelineSessionReport {
	recipeSteps: RecipeStepDefinition[];
	session: PipelineSessionRecord;
	stepResults: PipelineStepResultRecord[];
}
