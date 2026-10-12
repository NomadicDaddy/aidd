import type { ModeContext } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { auditNames, pendingAuditNames } from './audit-selection.ts';
import {
	auditRunSummary,
	type AuditRunTotals,
	maxAuditAttempts,
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
	/** Every audit the run was asked for, resolved once so the order holds for the whole run. */
	requested: Promise<string[]> | undefined;
	totals: AuditRunTotals;
}

export function createAuditRunState(): AuditRunState {
	return {
		attempts: new Map(),
		driverRecorded: false,
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
 * Where the run stands after the audit just processed.
 * @param plan The run plan carrying the audit selection.
 * @param state The run's progress so far.
 * @param context The mode context naming the project.
 * @returns The run-level artifacts and summary line, and the audits still to attempt.
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
		remainingAudits,
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
 * The summary for a selection that found nothing left to run. A run that had nothing to do says
 * so; a run that worked through audits reports what became of them, since "nothing left" is also
 * where a run lands after giving up on some.
 * @param state The run's progress so far.
 * @returns The fixed no-work line, or the run-level summary once anything was processed.
 */
export function noWorkSummary(state: AuditRunState): string {
	const touched = state.attempts.size > 0 || settledAudits(state.totals).size > 0;
	return touched ? auditRunSummary(state.totals, 0) : 'all requested audits have reports';
}
