import type { OutcomeRate } from './audits.ts';

export type TelemetryResourceType = 'recipe' | 'run' | 'skill';

export type TelemetryInvocationSource = 'cli' | 'recipe-step' | 'scheduled' | 'web';

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

// Cost rolled up per project over the selected window. `invocation_events` carries no cost of
// its own -- dollars come from the linked `runs` row -- so `costedInvocationCount` says how much of
// the project's work was actually priced, and a row with none is unknown coverage, not free work.
export interface TelemetryProjectCostRow {
	costedInvocationCount: number;
	costUsd: number;
	invocationCount: number;
	lastInvocationAt: number;
	projectName: string;
	projectPath: string;
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

export interface SkillRevisionUsage {
	avgDurationMs: null | number;
	cachedTokens: number;
	completed: number;
	failed: number;
	flagged: number;
	inputTokens: number;
	killed: number;
	lastUsedAt: number;
	noWork: number;
	outputTokens: number;
	reasoningTokens: number;
	resourceSha256: null | string;
	/** Runs this revision drove whose attributed commits were undone by a standard revert. */
	revertRate: OutcomeRate;
	running: number;
	runsWithTokenData: number;
	stopped: number;
	total: number;
	totalTokens: number;
	warnings: number;
}

export interface TelemetryResourceDetail {
	backendCounts: TelemetryBackendUsageRow[];
	recent: InvocationRecord[];
	revisions: SkillRevisionUsage[];
	usage: ResourceUsageRow;
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
	resourceSha256: null | string;
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
