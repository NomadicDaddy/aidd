import type { RunPlan } from 'aidd-shared/plan/types';

import { maxFlailIterations, maxFlailNudgeGrants } from 'aidd-shared/backends/flailing';
import { orchestratorExitCodes, type StopReason } from 'aidd-shared/orchestrator/result';

import type { IterationDetails } from '../details.ts';

import {
	formatFailureSummary,
	formatRecoverySummary,
	formatStopRequestedSummary,
} from '../formatters.ts';
import { flailingNudgeNote } from './carryover-notes.ts';

export type RunContinuation =
	| {
			carryoverNote?: string;
			consecutiveAborts: number;
			consecutiveFlails: number;
			kind: 'continue';
			reason: 'continuable_backend_interruption' | 'flailing_nudge' | 'normal';
	  }
	| {
			exitCode: number;
			kind: 'final';
			move: 'complete' | 'stopped';
			stoppedReason?: string;
			stopReason: StopReason;
			summary: string;
	  };

export function continuableBackendInterruptionRetryLimit(plan: RunPlan): null | number {
	const iterationLimit =
		plan.scope.maxIterations === null ? null : Math.max(1, plan.scope.maxIterations);
	// The dedicated timeout-retry cap bounds continuable interruptions even when maxIterations is
	// unlimited, so a silent-timeout provider cannot loop forever. `null`/undefined disables it
	// (legacy behavior: fall back to the iteration limit).
	const cap = plan.stopPolicy.maxConsecutiveTimeoutRetries;
	// 0 / null / undefined disable the dedicated cap (fall back to the iteration limit — legacy
	// behavior where continuable timeouts are bounded only by maxIterations, if set). A positive
	// cap is used as-is, clamped by the iteration limit when that is the tighter bound.
	if (cap === null || cap === undefined || cap <= 0) return iterationLimit;
	return iterationLimit === null ? cap : Math.min(cap, iterationLimit);
}

export function formatContinuableBackendInterruptionLimitSummary(
	displayedSummary: string,
	exitCode: number,
	details: IterationDetails,
	retryLimit: number,
	backendExitCode: number = exitCode,
): string {
	return `${formatFailureSummary(
		displayedSummary,
		exitCode,
		details,
		backendExitCode,
	)}; continuable backend interruption retry limit reached (${retryLimit})`;
}

export function determineRunContinuation(input: {
	backendExitCode?: number;
	completed: boolean;
	completedAfterBackendInterruption: boolean;
	completedFeatureCount: number;
	completedResultFeature: string | undefined;
	consecutiveAborts: number;
	consecutiveContinuableInterruptions: number;
	consecutiveFlails: number;
	details: IterationDetails;
	displayedSummary: string;
	exitCode: number;
	flailNudgeGrants: number;
	plan: RunPlan;
	recoveredActiveVerification: boolean;
	stopRequestedAfterRun: boolean;
}): RunContinuation {
	const {
		completed,
		completedAfterBackendInterruption,
		completedFeatureCount,
		completedResultFeature,
		consecutiveAborts,
		consecutiveContinuableInterruptions,
		consecutiveFlails,
		details,
		displayedSummary,
		exitCode,
		flailNudgeGrants,
		plan,
		recoveredActiveVerification,
		stopRequestedAfterRun,
	} = input;
	const backendExitCode = input.backendExitCode ?? exitCode;

	if (stopRequestedAfterRun && completedResultFeature === undefined) {
		return {
			exitCode: orchestratorExitCodes.success,
			kind: 'final',
			move: 'stopped',
			stoppedReason: 'stop requested after current iteration',
			stopReason: 'stop_requested',
			summary: formatStopRequestedSummary(displayedSummary, exitCode),
		};
	}
	if (
		isContinuableBackendInterruption(exitCode, details) &&
		!completedAfterBackendInterruption &&
		!recoveredActiveVerification &&
		plan.stopPolicy.continueOnTimeout
	) {
		const retryLimit = continuableBackendInterruptionRetryLimit(plan);
		if (retryLimit !== null && consecutiveContinuableInterruptions >= retryLimit) {
			return {
				exitCode,
				kind: 'final',
				move: 'complete',
				stopReason: 'exit_error',
				summary: formatContinuableBackendInterruptionLimitSummary(
					displayedSummary,
					exitCode,
					details,
					retryLimit,
					backendExitCode,
				),
			};
		}
		return {
			consecutiveAborts: 0,
			consecutiveFlails: 0,
			kind: 'continue',
			reason: 'continuable_backend_interruption',
		};
	}
	// Flailing guardrail: the first trip nudges (recompile the next iteration with a corrective
	// note); a second consecutive trip stops the run and parks the feature as waiting_approval, so a
	// stuck agent ends in minutes with a useful status instead of looping the nudge forever.
	// The nudge iteration is not charged against maxIterations (see post-iteration.ts), so the run's
	// total nudge budget is bounded here by maxFlailNudgeGrants instead.
	if (exitCode === orchestratorExitCodes.flailing) {
		const nextFlails = consecutiveFlails + 1;
		const grantsExhausted = flailNudgeGrants >= maxFlailNudgeGrants;
		if (nextFlails < maxFlailIterations && !grantsExhausted) {
			return {
				carryoverNote: flailingNudgeNote(),
				consecutiveAborts: 0,
				consecutiveFlails: nextFlails,
				kind: 'continue',
				reason: 'flailing_nudge',
			};
		}
		const exhaustion = grantsExhausted
			? `after ${flailNudgeGrants} corrective nudge(s)`
			: `after ${nextFlails} consecutive flailing iteration(s)`;
		return {
			exitCode: orchestratorExitCodes.success,
			kind: 'final',
			move: 'complete',
			stopReason: 'flailing',
			summary: `${displayedSummary}; stopped ${exhaustion}: the agent repeated non-productive actions (e.g. hunting for or starting a server) without progress — feature parked as waiting_approval`,
		};
	}
	let nextConsecutiveAborts: number;
	if (
		exitCode === orchestratorExitCodes.aborted &&
		!completedAfterBackendInterruption &&
		plan.stopPolicy.quitOnAbort > 0
	) {
		nextConsecutiveAborts = consecutiveAborts + 1;
		if (nextConsecutiveAborts < plan.stopPolicy.quitOnAbort) {
			return {
				consecutiveAborts: nextConsecutiveAborts,
				consecutiveFlails: 0,
				kind: 'continue',
				reason: 'normal',
			};
		}
	} else {
		nextConsecutiveAborts = 0;
	}
	if (recoveredActiveVerification) {
		return {
			exitCode: orchestratorExitCodes.success,
			kind: 'final',
			move: 'complete',
			stopReason: 'blocked',
			summary: formatRecoverySummary(displayedSummary, details),
		};
	}
	if (
		details.outcome.status === 'blocked_dirty_worktree' ||
		details.outcome.status === 'blocked_needs_user_input'
	) {
		const stopReason =
			completedFeatureCount > 0 ? 'partial_success_blocked' : details.outcome.status;
		const summaryPrefix =
			completedFeatureCount > 0
				? `partial success: ${completedFeatureCount} feature(s) completed; ${details.outcome.status}`
				: details.outcome.status;
		return {
			exitCode: orchestratorExitCodes.success,
			kind: 'final',
			move: 'complete',
			stopReason,
			summary: `${summaryPrefix}: ${displayedSummary}`,
		};
	}
	if (exitCode !== orchestratorExitCodes.success && !completedAfterBackendInterruption) {
		return {
			exitCode,
			kind: 'final',
			move: 'complete',
			stopReason: 'exit_error',
			summary: formatFailureSummary(displayedSummary, exitCode, details, backendExitCode),
		};
	}
	if (completedResultFeature !== undefined && plan.stopPolicy.stopWhenDone) {
		return {
			exitCode: orchestratorExitCodes.success,
			kind: 'final',
			move: 'complete',
			stopReason: 'completed',
			summary: displayedSummary,
		};
	}
	if (completed) {
		return {
			exitCode: orchestratorExitCodes.success,
			kind: 'final',
			move: 'complete',
			stopReason: 'completed',
			summary: displayedSummary,
		};
	}
	if (stopRequestedAfterRun) {
		return {
			exitCode: orchestratorExitCodes.success,
			kind: 'final',
			move: 'stopped',
			stoppedReason: 'stop requested after current iteration',
			stopReason: 'stop_requested',
			summary: formatStopRequestedSummary(displayedSummary, exitCode),
		};
	}
	return {
		consecutiveAborts: nextConsecutiveAborts,
		consecutiveFlails: 0,
		kind: 'continue',
		reason: 'normal',
	};
}

export function isContinuableBackendInterruption(
	exitCode: number,
	details: IterationDetails,
): boolean {
	if (exitCode === orchestratorExitCodes.idleTimeout) return true;
	if (exitCode !== orchestratorExitCodes.providerError) return false;
	if (details.outcome.status !== 'provider_error') return false;
	const providerMessage = details.providerError?.message ?? '';
	return isTransientProviderError(providerMessage);
}

function isTransientProviderError(message: string): boolean {
	return (
		/\b(?:timed?\s*out|timeout)\b/i.test(message) ||
		/\bHTTP\s+(?:408|500|502|503|504)\b/i.test(message) ||
		/\b(?:network error|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|temporarily unavailable|try again later|service unavailable|bad gateway|gateway timeout)\b/i.test(
			message,
		)
	);
}
