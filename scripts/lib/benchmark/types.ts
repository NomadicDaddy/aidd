export type BenchmarkBackendName =
	'claude-code' | 'cline' | 'codex' | 'kilocode' | 'lmstudio' | 'native' | 'ollama' | 'opencode';
/**
 * `provider_unavailable` is not a grade. It marks a run the provider refused to serve (quota wall
 * or transport failure), which carries no evidence about the model, so aggregation drops it from
 * both the correctness and the reliability populations instead of scoring it zero.
 */
export type RunStatus =
	'failure' | 'preflight_failed' | 'provider_unavailable' | 'skipped' | 'success' | 'timeout';

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
	auditEval?: AuditEvalCatalog;
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
	auditEval?: AuditEvalScoring;
	correctnessWeight: number;
	costPolicy: string;
	costWeight: number;
	reliabilityWeight: number;
	timeWeight: number;
}

export interface AuditEvalScoring {
	/** How far a cited line may sit from a cataloged line and still count as the same site. */
	lineTolerance: number;
	precisionWeight: number;
	recallWeight: number;
	/** When true, findings that match neither a defect nor a decoy also count against precision. */
	strictPrecision: boolean;
}

export interface AuditEvalSite {
	aliases: string[];
	auditId: string;
	file: string;
	id: string;
	line?: number;
	severity: string;
	symbol?: string;
}

export interface AuditEvalCatalog {
	auditId: string;
	decoys: AuditEvalSite[];
	defects: AuditEvalSite[];
	scoring: AuditEvalScoring;
}

export interface AuditEvalRunScore {
	auditId: string;
	/** Findings that pointed at a cataloged defect; one finding may credit several defects. */
	creditedFindingIds: string[];
	/** Findings that pointed at a benign decoy site; these always count against precision. */
	decoyFindingIds: string[];
	matchedDefectIds: string[];
	missedDefectIds: string[];
	precision: number;
	recall: number;
	/** Findings counted against precision: decoy hits plus, under strictPrecision, uncataloged ones. */
	spuriousFindingIds: string[];
	/** Findings matching neither a defect nor a decoy; noted, penalized only under strictPrecision. */
	uncatalogedFindingIds: string[];
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
	auditEval?: AuditEvalRunScore;
	notes: string[];
	score: number;
}

export interface BenchmarkRun {
	artifactPaths: BenchmarkArtifacts;
	auditEval?: AuditEvalRunScore;
	command: string[];
	correctnessScore: number;
	costUsd: null | number;
	durationSeconds: number;
	/**
	 * The aidd process's exit code. Recorded so a regrade can tell a provider refusal from a wrong
	 * answer; runs recorded before it existed lack it and cannot be reclassified.
	 */
	exitCode?: number;
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
	/**
	 * Runs the provider refused to serve, excluded from every average above. Present only when
	 * nonzero, so a reader can tell "scored badly" from "was never measured" — `runs: 0` with a
	 * count here means the row rests on no served run at all.
	 */
	providerUnavailableRuns?: number;
	reliability: number;
	/** Served runs behind the averages, not attempted runs. */
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
