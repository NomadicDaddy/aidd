export const backendNames = [
	'native',
	'ollama',
	'lmstudio',
	'openai',
	'claude-code',
	'opencode',
	'kilocode',
	'codex',
	'cline',
	'grok',
] as const;
export type BackendName = (typeof backendNames)[number];

export type BackendInputName = BackendName;

const backendNameSet = new Set<string>(backendNames);

export function normalizeBackendName(raw: string): BackendName | undefined {
	return backendNameSet.has(raw) ? (raw as BackendName) : undefined;
}

export function requireBackendName(raw: string): BackendName {
	const backend = normalizeBackendName(raw);
	if (backend === undefined) {
		throw new Error(`Unknown backend '${raw}' (expected one of: ${backendNames.join(', ')})`);
	}
	return backend;
}

export const modeNames = [
	'coding',
	'audit',
	'interview',
	'director',
	'todo',
	'validate',
	'directive',
	'triumvirate',
] as const;
export type AiddMode = (typeof modeNames)[number];

export interface RunScope {
	/** Opt-in sweep flag: include category-Audit findings in coding selection for this run. */
	auditFindings?: boolean;
	/** Optional audit source (e.g. SECURITY) narrowing the audit-findings sweep. */
	auditFindingsSource?: string;
	feature?: string;
	filters: FeatureFilter[];
	kind: 'director' | 'project';
	maxIterations: null | number;
	milestone?: string;
	projectDir?: string;
	specFile?: string;
}

export interface FeatureFilter {
	field: string;
	value: string;
}

export interface MilestoneFilter {
	featureDirectories: string[];
	value: string;
}

export interface StopPolicy {
	continueOnTimeout: boolean;
	/**
	 * Max consecutive continuable provider-timeout retries before the run gives up, independent
	 * of `maxIterations`. `0` (the config-reachable sentinel) or `null` disables the dedicated cap
	 * — it then falls back to the iteration limit (legacy behavior). Guards against a silent-timeout
	 * provider spinning up fresh agents indefinitely when `maxIterations` is unlimited.
	 */
	maxConsecutiveTimeoutRetries: null | number;
	quitOnAbort: number;
	stopFile: string;
	stopWhenDone: boolean;
}

export interface OutputPolicy {
	extractBatch: boolean;
	extractStructured: boolean;
	idleNudgeTimeoutSeconds: number;
	idleTimeoutSeconds: number;
	noClean: boolean;
	/** Run the fast backend/toolchain preflight probes before the first iteration. */
	preflightDoctor: boolean;
	rateLimitBackoffSeconds: number;
	rateLimitBufferSeconds: number;
	timeoutSeconds: number;
}

export interface AuditPlan {
	codeAfterAudit: boolean;
	current?: string;
	names: string[];
	onCompletion: string[];
	runAll: boolean;
}

export interface DirectorPlan {
	contextPath?: string;
	fleetSummaryPath: string;
	outputPath: string;
	suggestionSchemaPath?: string;
}

export interface TriumvirateRolePlan {
	backend: BackendName;
	model?: string;
}

export interface TriumviratePlan {
	execution: TriumvirateRolePlan;
	overseer: TriumvirateRolePlan;
	primary: TriumvirateRolePlan;
	secondary: TriumvirateRolePlan;
}

export interface RunBudget {
	/** Soft ceiling on total run cost in USD. Exceeding it warns; it never stops the run. */
	maxCostUsd?: number;
	/** Soft ceiling on total tokens (input + output). Exceeding it warns; never stops. */
	maxTokens?: number;
}

export interface WorktreePlan {
	/** Base commit the worktree was created from; used for merge-base and rollback. */
	baseSha: string;
	/** Branch created for this run, e.g. `aidd/run-<runId>`. */
	branch: string;
	/** Absolute path to the git worktree the run's execution + metadata writes land in. */
	dir: string;
}

export interface PromptFragmentRef {
	id: string;
	kind: 'audit' | 'backend' | 'common' | 'inline' | 'mode' | 'phase';
	path?: string;
}

export interface PromptPlan {
	backend: BackendName;
	customDirective?: string;
	customDirectiveReadonly?: boolean;
	featureFocus?: {
		directory: string;
		value: string;
	};
	filters: FeatureFilter[];
	fragments: PromptFragmentRef[];
	milestone?: MilestoneFilter;
	mode: AiddMode;
	phase: string;
	variables: Record<string, unknown>;
}

export interface RunPlan {
	audit?: AuditPlan;
	backend: BackendName;
	/** Soft cost/token ceilings. Warn-only: an overrun is logged and surfaced, never enforced. */
	budget?: RunBudget;
	checks: {
		artifacts: boolean;
		features: boolean;
	};
	/** When true, low-complexity features skip the triumvirate secondary + overseer stages
	 * (single planner straight to execution). Only affects triumvirate runs. */
	complexityTiering?: boolean;
	/** When true, the triumvirate overseer validates the chosen plan against
	 * spec.md/assertions.md/feature.json: contradictions abort, smaller gaps are injected into
	 * the execution prompt. Only affects triumvirate runs. */
	consistencyGate?: boolean;
	director?: DirectorPlan;
	dirtyTreeThreshold: number;
	featureFilter?: FeatureFilter;
	initGitAfterScaffold: boolean;
	mode: AiddMode;
	model?: string;
	noWorkBackoffMs: number;
	outputPolicy: OutputPolicy;
	projectDir: string;
	prompt: PromptPlan;
	provider?: string;
	reasoningEffort: string;
	scope: RunScope;
	simulation: boolean;
	/** End an initializer/onboarding run once the persisted blueprint reaches coding-ready state. */
	stopBeforeImplementation: boolean;
	stopPolicy: StopPolicy;
	thinking?: boolean;
	thinkingLevel?: string;
	triumvirate?: TriumviratePlan;
	/** When set, the run's working tree (execution + `.aidd/` metadata writes) is an
	 * isolated git worktree rather than `projectDir`. `projectDir` stays the merge target
	 * and planning-mirror source. */
	worktree?: WorktreePlan;
	/** Relative paths the backend may write to; all other writes are reverted and the
	 * iteration retried once, then the run fails with writeAllowlistViolation. */
	writeAllowlist?: string[];
}

/** The directory a run reads and writes its working tree in: the isolated worktree when
 * worktree mode is active, otherwise the canonical project directory. Threaded through every
 * per-iteration git/tree/cwd operation so the completion gate, ledger write, and execution
 * stage all agree on which tree is "the repo" for this run. */
export function runRepoDir(plan: Pick<RunPlan, 'projectDir' | 'worktree'>): string {
	return plan.worktree?.dir ?? plan.projectDir;
}
