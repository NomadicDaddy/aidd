import type { AuditPersistResult } from 'aidd-shared/modes/audit-persist';
import type { UnavailableAudit } from 'aidd-shared/modes/audit-shared';

/**
 * How many agent sessions one audit may fail in a single run before the run gives up on it. An
 * audit whose report is rejected every time would otherwise be selected forever.
 */
export const maxAuditAttempts = 2;

/**
 * How many sessions in a row may fail, across more than one audit, before the run stops. It is
 * every attempt at two audits (4): one audit failing all of its attempts is that audit's
 * problem and the ordinary give-up path, but a second audit doing the same straight after, with
 * no session answering in between, points at the backend whatever its error text says. A lower
 * limit would stop the run before the second audit had its retry; a higher one spends another
 * audit's sessions on a backend that is not answering.
 */
export const maxConsecutiveFailedSessions = 2 * maxAuditAttempts;

/** What a run has settled so far, across every audit session it has finished. */
export interface AuditRunTotals {
	/** Audits given up on after `maxAuditAttempts` failed sessions. */
	abandoned: string[];
	/** Audits that produced a report counting as evidence. */
	completed: string[];
	findingsCreated: number;
	findingsTotal: number;
	/**
	 * Set once the run has stopped itself because this many sessions in a row failed across
	 * different audits. The audits it had not reached stay pending; they are not given up on.
	 */
	stoppedAfterFailures?: number;
	/** Audits that could not be performed; none of them was made current by this run. */
	unavailable: UnavailableAudit[];
}

export function settledAudits(totals: AuditRunTotals): Set<string> {
	return new Set([
		...totals.abandoned,
		...totals.completed,
		...totals.unavailable.map((audit) => audit.auditName),
	]);
}

/**
 * The run-level line every audit summary carries, so the last summary a run writes describes
 * the whole run rather than only the audit its final session happened to hold.
 * @param totals What the run has settled so far.
 * @param remainingCount Audits still pending after the one just processed.
 * @returns One line, with the clauses that have nothing to report left out.
 */
export function auditRunSummary(totals: AuditRunTotals, remainingCount: number): string {
	const worklist = settledAudits(totals).size + remainingCount;
	const clauses = [
		`${totals.completed.length} of ${worklist} audit(s) done, ${totals.findingsTotal} finding(s) (${totals.findingsCreated} new)`,
	];
	if (totals.unavailable.length > 0) {
		clauses.push(
			`could not run: ${totals.unavailable.map((audit) => audit.auditName).join(', ')}`,
		);
	}
	if (totals.abandoned.length > 0) {
		clauses.push(
			`gave up after ${maxAuditAttempts} failed attempts: ${totals.abandoned.join(', ')}`,
		);
	}
	if (remainingCount > 0) clauses.push(`${remainingCount} remain`);
	return `${runLabel(totals, remainingCount)}: ${[...clauses, ...stopClauses(totals, remainingCount)].join('; ')}`;
}

function runLabel(totals: AuditRunTotals, remainingCount: number): string {
	if (remainingCount === 0) return 'audit run finished';
	return totals.stoppedAfterFailures === undefined ? 'audit run so far' : 'audit run stopped';
}

// A run that tripped the consecutive-failure limit says so and names the likely cause. It only
// reads as a stop when audits were left unattempted; with none left the run had finished anyway.
function stopClauses(totals: AuditRunTotals, remainingCount: number): string[] {
	if (totals.stoppedAfterFailures === undefined) return [];
	const streak = `${totals.stoppedAfterFailures} audit sessions in a row failed across different audits`;
	return [
		`${remainingCount > 0 ? `stopped because ${streak}` : streak}; the backend is the likely cause`,
	];
}

/**
 * The line for an audit whose session produced nothing usable: it exited non-zero, emitted no
 * structured result, or had its report rejected by validation.
 * @param auditName The audit the session was given.
 * @param reason Why the session did not count.
 * @param attempt Which failed attempt this was, counting from one.
 * @returns The per-audit summary line.
 */
export function auditFailureSummary(auditName: string, reason: string, attempt: number): string {
	return `audit ${auditName} did not complete (${reason}); no report written; failed attempt ${attempt} of ${maxAuditAttempts}`;
}

/**
 * The line for a session that ended for a reason that was not the audit's own: a stop, an
 * interruption, a safety stop, a rate limit, or a failure of the backend as a whole. No attempt
 * is counted, so the audit is still pending when the run ends or goes on.
 * @param auditName The audit the session was given.
 * @param reason Why the session did not count.
 * @returns The per-audit summary line.
 */
export function auditInterruptedSummary(auditName: string, reason: string): string {
	return `audit ${auditName} did not complete (${reason}); no report written; not counted as a failed attempt at the audit`;
}

// What became of the report of an audit that could not run.
function unavailableReportNote(unavailable: UnavailableAudit): string {
	return unavailable.keptReport === undefined
		? 'its report records why and the audit stays stale'
		: 'the report already written for it today is real evidence and was kept, so no could-not-run report was written';
}

// A torn or hand-edited ledger line is skipped rather than fatal; say so, because a skipped
// resolution can re-create a finding that was already dismissed.
function persistNotes(persisted: AuditPersistResult): string {
	const notes: string[] = [];
	if (persisted.suppressedDismissedCount > 0) {
		notes.push(`${persisted.suppressedDismissedCount} false-positive dismissal(s) suppressed`);
	}
	if (persisted.skippedLedgerLines > 0) {
		notes.push(`${persisted.skippedLedgerLines} malformed findings-ledger line(s) skipped`);
	}
	return notes.map((note) => `; ${note}`).join('');
}

/**
 * The line for an audit whose result was persisted — as real evidence, or as a could-not-run
 * result that does not make the audit current.
 * @param auditName The audit the session was given.
 * @param persisted What persisting its result wrote.
 * @param unavailable Set when the audit could not be performed.
 * @returns The per-audit summary line.
 */
export function auditResultSummary(
	auditName: string,
	persisted: AuditPersistResult,
	unavailable: UnavailableAudit | undefined,
): string {
	const duplicates = persisted.suppressedDuplicateCount;
	const preExisting =
		duplicates > 0 ? ` (${persisted.totalCreated} new, ${duplicates} pre-existing)` : '';
	const findings = `${persisted.totalFindings} finding(s)${preExisting}`;
	const headline =
		unavailable === undefined
			? `audit ${auditName} finished with ${findings}`
			: `audit ${auditName} could not run (${unavailable.reason}); ${unavailableReportNote(unavailable)}; ${findings} recorded`;
	return `${headline}${persistNotes(persisted)}`;
}

/**
 * A measurement audit can print a confident score while its own prose admits no artifact was
 * parsed. The score is rewritten in the report; surface the fact in the summary too so a run
 * never reads clean when a number was withheld.
 * @param persisted What persisting the result wrote.
 * @returns The warning, or undefined when no score was withheld.
 */
export function instrumentContractWarning(persisted: AuditPersistResult): string | undefined {
	if (persisted.unmeasuredScoresWithheld === 0) return undefined;
	return `WARNING: ${persisted.unmeasuredScoresWithheld} measurement audit report(s) declared a numeric score with no validated instruments[] entry; each score was rewritten to SKIPPED / data-unavailable. Produce a real measurement artifact and re-run those audits.`;
}
