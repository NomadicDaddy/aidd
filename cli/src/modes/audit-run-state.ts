import type { ModeContext, ModeResult } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import { auditNames, pendingAuditNames } from './audit-selection.ts';
import {
	auditRunSummary,
	type AuditRunTotals,
	maxAuditAttempts,
	maxConsecutiveFailedSessions,
	settledAudits,
} from './audit-summary.ts';

/**
 * What one run remembers between its audit sessions. Each session is handed exactly one audit;
 * this is what lets the next selection skip the audits already settled and lets every summary
 * describe the run rather than a single session.
 */
export interface AuditRunState {
	/** Failed sessions per audit; an audit reaching `maxAuditAttempts` is given up on. */
	attempts: Map<string, number>;
	driverRecorded: boolean;
	/**
	 * The audit of each session that failed without a result since a session last returned one,
	 * oldest first. A session that returns a result empties it, since the backend answered.
	 */
	failureStreak: string[];
	/** Every audit the run was asked for, resolved once so the order holds for the whole run. */
	requested: Promise<string[]> | undefined;
	totals: AuditRunTotals;
}

export function createAuditRunState(): AuditRunState {
	return {
		attempts: new Map(),
		driverRecorded: false,
		failureStreak: [],
		requested: undefined,
		totals: {
			abandoned: [],
			completed: [],
			findingsCreated: 0,
			findingsTotal: 0,
			unavailable: [],
		},
	};
}

export async function requestedAudits(
	plan: RunPlan,
	state: AuditRunState,
	context: ModeContext,
): Promise<string[]> {
	state.requested ??= auditNames(plan, context);
	return await state.requested;
}

/**
 * Whether the run is finished, and how it ends when it gave up on an audit. A run that abandoned
 * an audit did not do what it was asked, so it must not be recorded as a clean completion: with
 * other audits done it is a partial success, and with none done it is an error. Audits that could
 * not run do not change the ending; that outcome is legitimate and the summary names them. A run
 * that stopped itself after consecutive failed sessions is finished whatever is still pending,
 * and always ends as an error.
 * @param totals What the run has settled so far.
 * @param remainingCount Audits still pending.
 * @returns The completion fields of the mode result.
 */
export function auditRunCompletion(
	totals: AuditRunTotals,
	remainingCount: number,
): Pick<ModeResult, 'complete' | 'unsuccessfulEnding'> {
	const stopped = totals.stoppedAfterFailures !== undefined;
	if (remainingCount > 0 && !stopped) return { complete: false };
	if (totals.abandoned.length === 0 && !stopped) return { complete: true };
	// A run stopped by failures in a row never attempted the rest of its worklist, so it is an
	// error whatever it completed first. A dead backend recognised by its error text already ends
	// non-zero; the same condition recognised by count must not end as a success.
	return {
		complete: true,
		unsuccessfulEnding:
			totals.completed.length > 0 && !stopped
				? {
						exitCode: orchestratorExitCodes.success,
						stopReason: 'partial_success_blocked',
					}
				: { exitCode: orchestratorExitCodes.generalError, stopReason: 'exit_error' },
	};
}

/**
 * Where the run stands after the audit just processed.
 * @param plan The run plan carrying the audit selection.
 * @param state The run's progress so far.
 * @param context The mode context naming the project.
 * @returns The run-level artifacts and summary line, and whether the run is finished.
 */
export async function runProgress(plan: RunPlan, state: AuditRunState, context: ModeContext) {
	const requested = await requestedAudits(plan, state, context);
	const remainingAudits = await pendingAuditNames(
		plan,
		context,
		requested,
		settledAudits(state.totals),
	);
	return {
		artifacts: {
			abandonedAudits: [...state.totals.abandoned],
			remainingAudits,
			requestedAudits: requested,
			unavailableAudits: [...state.totals.unavailable],
		},
		completion: auditRunCompletion(state.totals, remainingAudits.length),
		summary: auditRunSummary(state.totals, remainingAudits.length),
	};
}

/**
 * Counts one failed session against the audit and gives up on it at the limit.
 * @param state The run's progress so far.
 * @param auditName The audit whose session failed.
 * @returns Which failed attempt this was, counting from one.
 */
export function recordFailedAttempt(state: AuditRunState, auditName: string): number {
	const attempt = (state.attempts.get(auditName) ?? 0) + 1;
	state.attempts.set(auditName, attempt);
	if (attempt >= maxAuditAttempts && !state.totals.abandoned.includes(auditName)) {
		state.totals.abandoned.push(auditName);
	}
	return attempt;
}

/**
 * Counts a session that failed without returning a result: one attempt at its audit, and one
 * more in the run's streak of such sessions. The streak is the net under the backend-wide
 * classifier, which reads error text and so misses wording it does not know. When the streak
 * reaches the limit over more than one audit, the run is marked stopped. One audit failing every
 * attempt never does that by itself; it is given up on and the run goes to the next.
 * @param state The run's progress so far.
 * @param auditName The audit whose session failed.
 * @returns Which failed attempt at the audit this was, counting from one.
 */
export function recordFailedSession(state: AuditRunState, auditName: string): number {
	state.failureStreak.push(auditName);
	const { failureStreak } = state;
	if (failureStreak.length >= maxConsecutiveFailedSessions && new Set(failureStreak).size > 1) {
		state.totals.stoppedAfterFailures = failureStreak.length;
	}
	return recordFailedAttempt(state, auditName);
}

/**
 * The summary for a selection that found nothing left to run. A run that had nothing to do says
 * so; a run that worked through audits reports what became of them, since "nothing left" is also
 * where a run lands after giving up on some. A run that stopped itself has audits left, so it
 * says only that nothing more is selected; its result carries the counts.
 * @param state The run's progress so far.
 * @returns The fixed no-work line, or the run-level summary once anything was processed.
 */
export function noWorkSummary(state: AuditRunState): string {
	if (state.totals.stoppedAfterFailures !== undefined) {
		return 'audit run stopped after consecutive failed sessions; no further audit is selected';
	}
	const touched = state.attempts.size > 0 || settledAudits(state.totals).size > 0;
	return touched ? auditRunSummary(state.totals, 0) : 'all requested audits have reports';
}

/**
 * The mode result for a selection that handed out no audit: every audit is settled, or the run
 * stopped itself and the rest stay pending. A stopped run reports where it stands, pending
 * audits included, and keeps its unsuccessful ending.
 * @param plan The run plan carrying the audit selection.
 * @param state The run's progress so far.
 * @param context The mode context naming the project.
 * @returns The result that ends the run.
 */
export async function noWorkResult(
	plan: RunPlan,
	state: AuditRunState,
	context: ModeContext,
): Promise<ModeResult> {
	if (state.totals.stoppedAfterFailures !== undefined) {
		const progress = await runProgress(plan, state, context);
		return { artifacts: progress.artifacts, ...progress.completion, summary: progress.summary };
	}
	return {
		artifacts: {
			abandonedAudits: [...state.totals.abandoned],
			remainingAudits: [],
			unavailableAudits: [...state.totals.unavailable],
		},
		...auditRunCompletion(state.totals, 0),
		summary: noWorkSummary(state),
	};
}
