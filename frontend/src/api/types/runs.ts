import type { BackendInputName, BackendName } from './skills.ts';

// Mirrors backend WebRunMode (backend/src/types/run.ts) and the ck_runs_mode CHECK constraint.
// 'directive' is set internally by pipeline step handlers — filterable, but never user-launchable
// (keep it out of the RunLaunchCard mode selector).
export type RunMode =
	| 'audit'
	| 'coding'
	| 'directive'
	| 'director'
	| 'interview'
	| 'todo'
	| 'triumvirate'
	| 'validate';

export type RunStatus = 'completed' | 'failed' | 'killed' | 'running' | 'stopped';

export type RunSource = 'cli' | 'director' | 'web';

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

export type PipelineStepStatus =
	'completed' | 'failed' | 'queued' | 'running' | 'skipped' | 'stopped';

export type RecipeStepOnFailure = 'auto-fix' | 'continue' | 'stop';

export type RecipeStepType = 'aidd-cli' | 'recipe-ref' | 'shell' | 'skill';

export type RunOutputState = 'cli-only' | 'empty' | 'ok' | 'unavailable';

export interface RunOutputResponse {
	output: string;
	reason: null | string;
	state: RunOutputState;
	/** Size of the full transcript on disk in bytes; may exceed `output.length` when truncated. */
	totalBytes?: number;
	/** True when `output` is only the trailing window of a transcript larger than the server cap. */
	truncated?: boolean;
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
	durationMs: null | number;
	errorMessage: null | string;
	exitCode: null | number;
	heartbeatAt: null | number;
	id: string;
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
	completedAt: null | number;
	currentStepIndex: number;
	durationMs: null | number;
	errorMessage: null | string;
	id: string;
	parametersJson: string;
	projectName: string;
	projectPath: string;
	recipeId: string;
	recipeName: string;
	startedAt: number;
	status: PipelineSessionStatus;
	totalSteps: number;
}

export interface PipelineStepResultRecord {
	completedAt: null | number;
	depth: number;
	displayOrder: number;
	durationMs: null | number;
	errorMessage: null | string;
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
	stepName: string;
	stepType: 'hook' | RecipeStepType;
}

export interface PipelineSessionReport {
	recipeSteps: RecipeStepDefinition[];
	session: PipelineSessionRecord;
	stepResults: PipelineStepResultRecord[];
}
