export type BenchmarkBackendName =
	'claude-code' | 'cline' | 'codex' | 'kilocode' | 'lmstudio' | 'native' | 'ollama' | 'opencode';
export type RunStatus = 'failure' | 'preflight_failed' | 'skipped' | 'success' | 'timeout';

export interface BenchmarkStack {
	cli: BenchmarkBackendName;
	label: string;
	model: string;
	provider?: string;
	reasoningEffort?: string;
	simulation?: boolean;
	thinking?: boolean;
	thinkingLevel?: string;
	view: string;
}

export interface BenchmarkTask {
	category: 'agentic' | 'control';
	command: string;
	evaluation?: string;
	fixture: string;
	id: string;
	scoredRepetitions?: number;
	timeoutSeconds: number;
	warmupRepetitions?: number;
}

export interface BenchmarkCohort {
	members: string[];
	name: string;
	targetModelFamily: string;
}

export interface BenchmarkScoring {
	correctnessWeight: number;
	costPolicy: string;
	costWeight: number;
	reliabilityWeight: number;
	timeWeight: number;
}

/** Per-family token pricing used to estimate cost when a backend reports tokens but
 * no dollar cost. Prices are USD per million tokens. Omitted fields default to 0. */
export interface BenchmarkModelPricing {
	cachedPerMtok?: number;
	inputPerMtok: number;
	outputPerMtok: number;
	reasoningPerMtok?: number;
}

export interface BenchmarkSettings {
	controlTasksExcludedFromComposite: boolean;
	fixedEnv: Record<string, string>;
	preflight: {
		timeoutSeconds: number;
	};
	scoredRepetitions: number;
	warmupRepetitions: number;
}

export interface BenchmarkManifest {
	cohorts: BenchmarkCohort[];
	pricing: Record<string, BenchmarkModelPricing>;
	scoring: BenchmarkScoring;
	settings: BenchmarkSettings;
	stacks: BenchmarkStack[];
	tasks: BenchmarkTask[];
	version: 1;
}

export interface BenchmarkArgs {
	dryRun: boolean;
	manifest: string;
	regrade: boolean;
	reportOnly: boolean;
	resultsDir: string;
	seed?: string;
	selectedStacks: string[];
	selectedTasks: string[];
	skipPreflight: boolean;
	workspacesDir: string;
}

export interface CommandResult {
	durationSeconds: number;
	status: number;
	stderr: string;
	stdout: string;
	timedOut: boolean;
}

export interface BenchmarkArtifacts {
	auditReports: string[];
	rawLogs: string[];
	responses: string[];
	runsLedger: string[];
	structuredLogs: string[];
	workspace: string;
}

export interface TokenUsage {
	cachedTokens: number;
	inputTokens: number;
	known: boolean;
	outputTokens: number;
	reasoningTokens: number;
}

export interface ParsedMetrics {
	costUsd: null | number;
	durationSeconds: number;
	errorCount: number;
	exitStatus: 'failure' | 'success' | 'unknown';
	iterations: number;
	rateLimitCount: number;
	tokenUsage: TokenUsage;
}

export interface EvaluationResult {
	notes: string[];
	score: number;
}

export interface BenchmarkRun {
	artifactPaths: BenchmarkArtifacts;
	command: string[];
	correctnessScore: number;
	costUsd: null | number;
	durationSeconds: number;
	fixtureHash: string;
	iterations: number;
	notes: string[];
	replicate: number;
	stack: BenchmarkStack;
	status: RunStatus;
	taskId: string;
	tokenUsage: TokenUsage;
	workspaceHash: string;
}

export interface BenchmarkPreflight {
	durationSeconds: number;
	message?: string;
	model: string;
	ok: boolean;
	status: RunStatus;
}

export interface RunMatrixItem {
	replicate: number;
	stack: BenchmarkStack;
	task: BenchmarkTask;
	warmup: boolean;
}

export interface AggregateRow {
	averageCorrectness: number;
	averageCost: null | number;
	averageDuration: number;
	category: 'agentic' | 'control';
	compositeScore: number;
	costScore: null | number;
	reliability: number;
	runs: number;
	stackLabel: string;
	taskId: string;
	timeScore: number;
}

export interface BenchmarkAggregate {
	agenticRows: AggregateRow[];
	cohorts: { members: string[]; name: string; rows: AggregateRow[] }[];
	controlRows: AggregateRow[];
	generatedAt: string;
	scoring: BenchmarkScoring;
}
