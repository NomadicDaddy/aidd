export type IterationOutcomeStatus =
	| 'aborted'
	| 'active_verification_recovery'
	| 'active_verification_timeout'
	| 'audit_findings_contract_dropped'
	| 'blocked_dirty_worktree'
	| 'blocked_needs_user_input'
	| 'completion_pending_commit'
	| 'failure'
	| 'flailing'
	| 'idle_timeout'
	| 'missing_aidd_result'
	| 'missing_audit_artifacts'
	| 'no_assistant'
	| 'provider_error'
	| 'provider_flagged'
	| 'rate_limited'
	| 'success'
	| 'validation_error'
	| 'verification_lifecycle_conflict';

export type IterationErrorType =
	'build' | 'general' | 'lint' | 'permission' | 'provider' | 'timeout' | 'typescript';

export interface IterationError {
	message: string;
	type: IterationErrorType;
}

export interface IterationDetailsSummary {
	bashCommandsRun: number;
	finalChecks: FinalCheckSummary;
	hasBuildErrors: boolean;
	hasLintErrors: boolean;
	hasTypeErrors: boolean;
	totalToolCalls: number;
	uniqueFilesCreated: number;
	uniqueFilesEdited: number;
	uniqueFilesRead: number;
}

export interface FinalCheckSummary {
	build?: FinalCheckStatus;
	format?: FinalCheckStatus;
	smokeQc?: FinalCheckStatus;
	typecheck?: FinalCheckStatus;
}

export type FinalCheckStatus = 'failed' | 'passed';

export interface IterationDetails {
	/** Operator-actionable notices a backend reported through its error channel but which are not
	 * failures (e.g. codex truncating skill descriptions to fit its context budget). Kept apart
	 * from `errors` so they never explain an outcome, and surfaced so a real configuration problem
	 * is not silently discarded along with the noise. */
	advisories?: string[];
	commands: string[];
	/** True when at least one command result carried a definitive pass/fail verdict (an exit code or
	 * a [PASS]/[FAIL] marker). False means this backend gave us no way to tell gates apart, so an
	 * empty failedCommands is "unknown", not "nothing failed". */
	commandStatusEvidence: boolean;
	errors: IterationError[];
	failedCommands: string[];
	featureDescription?: string;
	featureSlug?: string;
	filesCreated: string[];
	filesEdited: string[];
	filesRead: string[];
	outcome: {
		activeVerificationRecovery?: ActiveVerificationRecovery;
		activeVerificationTimeout?: ActiveVerificationTimeout;
		exitCode: number;
		status: IterationOutcomeStatus;
		verificationLifecycleConflict?: VerificationLifecycleConflict;
	};
	providerError?: {
		message: string;
		requestId?: string;
	};
	summary: IterationDetailsSummary;
}

export interface VerificationLifecycleConflict {
	commands: string[];
	controlledLifecycle: boolean;
	failurePhase: 'verification';
	reason: 'server_lifecycle_conflict';
}

export interface ActiveVerificationTimeout {
	broadCommands: string[];
	commands: string[];
	failurePhase: 'verification';
	lastProgress: string;
	reason: 'silent_during_active_verification';
	targetedEvidence: string[];
}

export interface ActiveVerificationRecovery {
	commands: string[];
	decision: 'waiting_approval';
	failurePhase: 'verification';
	reason: 'targeted_verification_passed_broad_gate_timed_out';
	targetedEvidence: string[];
	timedOutCommand: string;
}
