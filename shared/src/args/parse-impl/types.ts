import { type BackendName } from '../../plan/types.ts';
import { type ReasoningEffortValue, type ThinkingLevelValue } from '../constants.ts';

export interface ParsedArgs {
	auditAll: boolean;
	/** Opt-in sweep: include category-Audit findings in coding selection for this run. */
	auditFindings: boolean;
	/** Optional audit source (e.g. SECURITY) to narrow the audit-findings sweep. */
	auditFindingsSource?: string;
	auditMode: boolean;
	auditModel?: string;
	auditNames: string[];
	auditOnCompletionNames: string[];
	checkArtifacts: boolean;
	checkFeatures: boolean;
	cli?: BackendName;
	codeAfterAudit: boolean;
	codeModel?: string;
	complexityTiering: boolean;
	configMatrix: boolean;
	consistencyGate: boolean;
	continueOnTimeout: boolean;
	customPrompt?: string;
	directiveMode: boolean;
	directiveReadonly: boolean;
	directorContextPath?: string;
	directorMode: boolean;
	directorOutputPath?: string;
	dirtyTreeThreshold?: number;
	execCli?: BackendName;
	execModel?: string;
	extractBatch: boolean;
	extractStructured: boolean;
	feature?: string;
	filterBy?: string;
	filterValue?: string;
	fleetSummaryPath?: string;
	help: boolean;
	idleNudgeTimeoutSeconds?: number;
	idleTimeoutSeconds?: number;
	initGitAfterScaffold?: boolean;
	initModel?: string;
	inProgressMode: boolean;
	interviewFile?: string;
	interviewMode: boolean;
	maxCostUsd?: number;
	maxIterations?: number;
	maxTokens?: number;
	mcpMode?: boolean;
	milestone?: string;
	model?: string;
	noClean: boolean;
	noWorkBackoffMs?: number;
	overseerCli?: BackendName;
	overseerModel?: string;
	projectDir?: string;
	quitOnAbort?: number;
	reasoningEffort?: ReasoningEffortValue;
	secondaryCli?: BackendName;
	secondaryModel?: string;
	simulation: boolean;
	skillArgs?: string;
	skillId?: string;
	specFile?: string;
	stopBeforeImplementation: boolean;
	stopSignal: boolean;
	stopWhenDone: boolean;
	suggestionSchemaPath?: string;
	thinking?: boolean;
	thinkingLevel?: ThinkingLevelValue;
	timeoutSeconds?: number;
	todoMode: boolean;
	triumvirateMode: boolean;
	validateMode: boolean;
	version: boolean;
	webMode?: boolean;
	webPort?: number;
	/** Run execution + `.aidd/` writes in an isolated git worktree instead of the live tree. */
	worktree: boolean;
	writeAllowlist: string[];
}

// Reader closures shared by all flag-group handlers. They encapsulate the inline-value
// (`--flag=value`) bookkeeping so handlers can fetch/validate operands uniformly.
export interface ParseContext {
	argv: string[];
	parseBackend(raw: string): BackendName;
	parseDecimal(index: number, flag: string): number;
	parseList(raw: string): string[];
	parseNumber(index: number, flag: string): number;
	parseReasoningEffort(raw: string): ReasoningEffortValue;
	parseThinkingLevel(raw: string): ThinkingLevelValue;
	requireValue(index: number, flag: string): string;
}

export function createDefaultParsedArgs(): ParsedArgs {
	return {
		auditAll: false,
		auditFindings: false,
		auditMode: false,
		auditNames: [],
		auditOnCompletionNames: [],
		checkArtifacts: false,
		checkFeatures: false,
		codeAfterAudit: false,
		complexityTiering: false,
		configMatrix: false,
		consistencyGate: false,
		continueOnTimeout: true,
		directiveMode: false,
		directiveReadonly: false,
		directorMode: false,
		extractBatch: false,
		extractStructured: false,
		help: false,
		initGitAfterScaffold: false,
		inProgressMode: false,
		interviewMode: false,
		mcpMode: false,
		noClean: false,
		simulation: false,
		stopBeforeImplementation: false,
		stopSignal: false,
		stopWhenDone: false,
		todoMode: false,
		triumvirateMode: false,
		validateMode: false,
		version: false,
		webMode: false,
		worktree: false,
		writeAllowlist: [],
	};
}
