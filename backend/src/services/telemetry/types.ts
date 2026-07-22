export type TelemetryResourceType = 'recipe' | 'run' | 'skill';
export type TelemetryInvocationSource = 'cli' | 'recipe-step' | 'web';
export type TelemetryInvocationStatus = 'completed' | 'failed' | 'killed' | 'running' | 'stopped';
export type TelemetryRunStatus = 'waiting_approval' | TelemetryInvocationStatus;

export interface RecordStartInput {
	argsPresent?: boolean | undefined;
	backend?: null | string | undefined;
	model?: null | string | undefined;
	parentInvocationId?: string | undefined;
	parentResourceId?: string | undefined;
	parentResourceType?: TelemetryResourceType | undefined;
	projectName: string;
	projectPath: string;
	resourceId: string;
	resourceName: string;
	resourceType: TelemetryResourceType;
	runId?: string | undefined;
	sessionId?: string | undefined;
	source: TelemetryInvocationSource;
	startedAt: number;
}

export interface RecordCompletionInput {
	completedAt: number;
	durationMs: number;
	errorMessage?: null | string | undefined;
	exitCode?: null | number | undefined;
	status: TelemetryInvocationStatus;
}

export interface ResourceUsageRow {
	avgDurationMs: null | number;
	completed: number;
	failed: number;
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

export interface TimeseriesPoint {
	bucket: number;
	completed: number;
	failed: number;
	killed: number;
	noWork: number;
	running: number;
	stopped: number;
	total: number;
	warnings: number;
}

export interface BackendUsageRow {
	backend: null | string;
	count: number;
}

// Per-bucket sums of run output metrics. `runs` counts every terminal run in the bucket;
// `runsWithLineData`/`runsWithTokenData` count how many contributed to each sum, so the UI can
// flag buckets where most runs predate metric capture instead of reading a low bar as low output.
export interface OutputTimeseriesPoint {
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
	// Authoritative facts copied from the linked `runs` row (null for non-run invocations), so the
	// UI can derive the same outcome the Runs page shows via the shared classifier.
	runStatus: null | TelemetryRunStatus;
	runStopReason: null | string;
	runSummary: null | string;
	sessionId: null | string;
	source: TelemetryInvocationSource;
	startedAt: number;
	status: TelemetryInvocationStatus;
}

export interface ResourceDetail {
	backendCounts: BackendUsageRow[];
	recent: InvocationRecord[];
	usage: ResourceUsageRow;
}
