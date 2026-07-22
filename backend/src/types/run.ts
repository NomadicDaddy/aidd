import type { BackendInputName, BackendName } from 'aidd-shared/plan/types';
import type { AiddRunProvenance } from 'aidd-shared/run-provenance';

export type WebRunMode =
	| 'audit'
	| 'coding'
	| 'directive'
	| 'director'
	| 'interview'
	| 'todo'
	| 'triumvirate'
	| 'validate';

export type WebRunStatus =
	'completed' | 'failed' | 'killed' | 'running' | 'stopped' | 'waiting_approval';

export type RunSource = 'cli' | 'director' | 'web';

/** Why a terminal coding run supports a follow-up launch under the same launch target. */
export type RunContinuationReason = 'initializer_handoff' | 'wall_clock_timeout';

/** Persisted continuation evaluation: an eligible reason, or 'none' (evaluated, not eligible).
 * The DB column is additionally NULL for rows not yet evaluated. */
export type RunContinuationValue = 'none' | RunContinuationReason;

export interface RunLaunchCommand {
	args: string[];
	display: string;
	source: 'exact' | 'reconstructed';
}

export interface RunRecord extends AiddRunProvenance {
	activityState: null | string;
	aiSummary: null | string;
	backend: BackendName;
	canKill: boolean;
	canReadOutput: boolean;
	canStop: boolean;
	chainedFromRunId: null | string;
	completedAt: null | number;
	continuationReason: null | RunContinuationReason;
	durationMs: null | number;
	errorMessage: null | string;
	exitCode: null | number;
	heartbeatAt: null | number;
	id: string;
	launchCommand: null | RunLaunchCommand;
	logPath: null | string;
	mode: WebRunMode;
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
	status: WebRunStatus;
	stopReason: null | string;
	/** True while a running run has a pending stop request (the project stop file exists), so the
	 * UI can show "Stopping…" during the graceful wind-down instead of a plain "Running". */
	stopRequested: boolean;
	summary: null | string;
}

export interface RunLaunchRequest {
	auditAll?: boolean;
	/** Coding sweep opt-in: include category-Audit findings in selection (passes --audit-findings). */
	auditFindings?: boolean;
	/** Optional audit source (e.g. SECURITY) narrowing the audit-findings sweep. */
	auditFindingsSource?: string;
	auditNames?: string[];
	backend?: BackendInputName;
	/** Set internally (never via the launch route body) when this run continues a prior run. */
	chainedFromRunId?: string;
	checkArtifacts?: boolean;
	/** A review-only skill directive receives the CLI's --directive-readonly contract. */
	directiveReadonly?: boolean;
	directorContextPath?: string;
	directorCycleId?: string;
	directorFleetSummaryPath?: string;
	directorOutputPath?: string;
	execBackend?: BackendInputName;
	execModel?: string;
	extraArgs?: string;
	feature?: string;
	filterBy?: string;
	filterValue?: string;
	initGitAfterScaffold?: boolean;
	interview?: boolean;
	maxIterations?: number;
	mode?: WebRunMode;
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
	/** Arguments for the invoked skill; forwarded as --skill-args (requires skillId). */
	skillArgs?: string;
	/** Invoked skill id; forwarded as --skill so the CLI compiles the directive and stages the skill's contracts. */
	skillId?: string;
	specFile?: string;
	/** Halt an initializer/onboarding run after its persisted blueprint is coding-ready. */
	stopBeforeImplementation?: boolean;
	validate?: boolean;
	/** Run execution in an isolated git worktree (passes --worktree to the CLI). */
	worktree?: boolean;
	writeAllowlist?: string[];
}

export type ReasoningEffort = 'high' | 'low' | 'medium' | 'minimal' | 'none' | 'xhigh';
