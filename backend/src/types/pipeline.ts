export type PipelineSessionStatus =
	'completed_with_failures' | 'completed' | 'failed' | 'queued' | 'running' | 'stopped';

export type PipelineStepPhase = 'post-hook' | 'pre-hook' | 'step';

export type PipelineStepStatus =
	'completed' | 'failed' | 'queued' | 'running' | 'skipped' | 'stopped';

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
