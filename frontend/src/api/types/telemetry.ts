export type TelemetryResourceType = 'recipe' | 'run' | 'skill';

export type TelemetryInvocationSource = 'cli' | 'recipe-step' | 'web';

export type TelemetryInvocationStatus = 'completed' | 'failed' | 'killed' | 'running' | 'stopped';
export type TelemetryRunStatus = 'waiting_approval' | TelemetryInvocationStatus;

export interface ResourceUsageRow {
	avgDurationMs: null | number;
	completed: number;
	failed: number;
	flagged: number;
	killed: number;
	lastUsedAt: null | number;
	nested: number;
	noWork: number;
	resourceId: string;
	resourceName: string;
	resourceType: TelemetryResourceType;
	running: number;
	stopped: number;
	topLevel: number;
	total: number;
	warnings: number;
}

export interface TelemetryTimeseriesPoint {
	bucket: number;
	completed: number;
	failed: number;
	flagged: number;
	killed: number;
	noWork: number;
	running: number;
	stopped: number;
	total: number;
	warnings: number;
}

export interface TelemetryBackendUsageRow {
	backend: null | string;
	count: number;
}

// Per-bucket sums of run output metrics (git lines over attributed commits, token usage).
// runsWithLineData/runsWithTokenData say how many of the bucket's runs actually carried each
// metric, so the UI can distinguish "quiet bucket" from "runs that predate capture".
export interface TelemetryOutputTimeseriesPoint {
	bucket: number;
	cachedTokens: number;
	filesChanged: number;
	inputTokens: number;
	linesAdded: number;
	linesRemoved: number;
	outputTokens: number;
	reasoningTokens: number;
	runs: number;
	runsWithFileData: number;
	runsWithLineData: number;
	runsWithTokenData: number;
}

export interface InvocationRecord {
	argsPresent: boolean;
	backend: null | string;
	completedAt: null | number;
	durationMs: null | number;
	errorMessage: null | string;
	exitCode: null | number;
	id: string;
	model: null | string;
	parentInvocationId: null | string;
	parentResourceId: null | string;
	parentResourceName: null | string;
	parentResourceType: null | TelemetryResourceType;
	projectName: string;
	projectPath: string;
	resourceId: string;
	resourceName: string;
	resourceType: TelemetryResourceType;
	runExitCode: null | number;
	runId: null | string;
	runStatus: null | TelemetryRunStatus;
	runStopReason: null | string;
	runSummary: null | string;
	sessionId: null | string;
	source: TelemetryInvocationSource;
	startedAt: number;
	status: TelemetryInvocationStatus;
}

export type AppLaunchStatus = 'crashed' | 'running' | 'stopped';

export interface AppLaunch {
	command: string;
	pid: null | number;
	projectId: string;
	projectPath: string;
	startedAt: null | number;
	status: AppLaunchStatus;
	stoppedAt: null | number;
}
