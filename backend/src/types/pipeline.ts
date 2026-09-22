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
	/** Run this step only when the resolved string parameter exactly matches `equals`. */
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
