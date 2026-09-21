import type { RunInitiator } from 'aidd-shared/metadata/active-runs';
import type { BackendInputName, BackendName } from 'aidd-shared/plan/types';
import type { AiddRunDriver } from 'aidd-shared/run-provenance';
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
	'completed' | 'failed' | 'killed' | 'queued' | 'running' | 'stopped' | 'waiting_approval';

export type RunSource = 'cli' | 'director' | 'scheduled' | 'web';

/**
 * Whether a person asked for this run, or aidd started it on its own. Re-exported rather than
 * restated so the API surface and the persisted vocabulary cannot drift apart; see the type's own
 * doc comment for why `source` cannot answer this.
 */
export type { RunInitiator };

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

export interface RunRecord extends AiddRunDriver, AiddRunProvenance {
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
	/** Null when not recorded; never inferred after the fact. */
	initiator: null | RunInitiator;
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
	scheduledTaskExecutionId?: null | string;
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
	/** Internal pipeline handoff identifying the exact recipe step that launched this run. */
	driver?: AiddRunDriver;
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
