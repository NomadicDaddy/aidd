import type { AuditPersistResult } from 'aidd-shared/modes/audit-persist';
import type {
	ModeContext,
	ModeHandler,
	ModeResult,
	ModeSummary,
	SelectedWork,
} from 'aidd-shared/modes/types';
import type { AgentRunResult } from 'aidd-shared/orchestrator/result';
import type { PromptPlan, RunPlan } from 'aidd-shared/plan/types';

import { buildDependencyTopology } from 'aidd-shared/metadata/features';
import { hasStructuredAuditOutput } from 'aidd-shared/modes/audit-parsing';
import { persistAuditReports } from 'aidd-shared/modes/audit-persist';

import { setAuditRunDriver } from '../run-driver.ts';
import {
	type AuditRunState,
	createAuditRunState,
	noWorkResult,
	noWorkSummary,
	recordFailedAttempt,
	recordFailedSession,
	requestedAudits,
	runProgress,
} from './audit-run-state.ts';
import { pendingAuditNames, selectedAuditName } from './audit-selection.ts';
import { auditSessionFailureKind, isBackendWideFailure } from './audit-session-failure.ts';
import {
	auditFailureSummary,
	auditInterruptedSummary,
	auditResultSummary,
	instrumentContractWarning,
	settledAudits,
} from './audit-summary.ts';

function sessionFailureReason(result: AgentRunResult): string | undefined {
	if (result.exitCode !== 0) return `agent exited ${result.exitCode}`;
	if (!hasStructuredAuditOutput(result.structuredResult)) {
		return 'no AIDD_RESULT structured output emitted';
	}
	return undefined;
}

// Whether the failure is the audit's own. One that is not (a stop, an interruption, a safety
// stop, a rate limit, a failure of the backend as a whole) is decided here, before anything is
// counted, so no audit is ever given up on because of it.
function isAuditsOwnFailure(result: AgentRunResult): boolean {
	return (
		auditSessionFailureKind(result.exitCode) !== 'terminal' &&
		!isBackendWideFailure(result.events)
	);
}

// A session that failed on its own account is one attempt at its audit, and one more in the
// run's streak of failed sessions.
async function failedSessionResult(
	plan: RunPlan,
	state: AuditRunState,
	context: ModeContext,
	auditName: string,
	failure: { reason: string; result: AgentRunResult },
): Promise<ModeResult> {
	const { reason } = failure;
	const attempt = isAuditsOwnFailure(failure.result)
		? recordFailedSession(state, auditName)
		: undefined;
	const progress = await runProgress(plan, state, context);
	const auditSummary =
		attempt === undefined
			? auditInterruptedSummary(auditName, reason)
			: auditFailureSummary(auditName, reason, attempt);
	return {
		artifacts: {
			auditFindings: {},
			auditName,
			completedAudits: [],
			...(attempt === undefined ? {} : { failedAttempt: attempt }),
			failureReason: reason,
			findingsCreated: 0,
			findingsTotal: 0,
			invalidAuditReports: [],
			missingAudits: [auditName],
			perAuditFindingsCreated: {},
			perAuditFindingTotals: {},
			perAuditReportPaths: {},
			...progress.artifacts,
		},
		...progress.completion,
		summary: `${auditSummary}\n${progress.summary}`,
	};
}

// Settles the audit against the run: done, unable to run, or — when validation rejected the
// report and nothing was written — one more failed attempt, which is then returned. Each of the
// three is a session that returned a result, so the backend answered and the streak of sessions
// that failed without one starts over.
function settlePersistedAudit(
	state: AuditRunState,
	auditName: string,
	persisted: AuditPersistResult,
): { failedAttempt?: number; summary: string } {
	const { totals } = state;
	state.failureStreak.length = 0;
	totals.findingsCreated += persisted.totalCreated;
	totals.findingsTotal += persisted.totalFindings;
	const unavailable = persisted.unavailableAudits.find((audit) => audit.auditName === auditName);
	if (unavailable !== undefined) {
		totals.unavailable.push(unavailable);
		return { summary: auditResultSummary(auditName, persisted, unavailable) };
	}
	if (persisted.completedAudits.includes(auditName)) {
		totals.completed.push(auditName);
		return { summary: auditResultSummary(auditName, persisted, undefined) };
	}
	const failedAttempt = recordFailedAttempt(state, auditName);
	return {
		failedAttempt,
		summary: auditFailureSummary(auditName, 'report rejected by validation', failedAttempt),
	};
}

// The finding counts the run record carries per audit. Audit scoring reads every name here as an
// audit this run performed, so only an audit that produced real evidence is on it: one that
// could not run is not credited with a performance, whatever findings it filed.
function completedFindingTotals(persisted: AuditPersistResult): Record<string, number> {
	return Object.fromEntries(
		persisted.completedAudits.map((name) => [name, persisted.perAuditFindingTotals[name] ?? 0]),
	);
}

async function persistedSessionResult(
	plan: RunPlan,
	state: AuditRunState,
	context: ModeContext,
	auditName: string,
	persisted: AuditPersistResult,
): Promise<ModeResult> {
	const { failedAttempt, summary: auditSummary } = settlePersistedAudit(
		state,
		auditName,
		persisted,
	);
	const progress = await runProgress(plan, state, context);
	const warning = instrumentContractWarning(persisted);
	return {
		artifacts: {
			auditFindings: completedFindingTotals(persisted),
			auditName,
			completedAudits: persisted.completedAudits,
			...(failedAttempt === undefined ? {} : { failedAttempt }),
			findingIds: persisted.findingIds,
			findingsCreated: persisted.totalCreated,
			findingsTotal: persisted.totalFindings,
			instrumentContractWarning: warning,
			invalidAuditReports: persisted.invalid,
			// Missing means the session left its audit unsettled. An audit that could not run is
			// settled even when no report was written for it because a real one was kept.
			missingAudits: failedAttempt === undefined ? [] : [auditName],
			...persisted.fileChanges,
			perAuditFindingsCreated: persisted.perAuditFindingsCreated,
			perAuditFindingTotals: persisted.perAuditFindingTotals,
			perAuditReportPaths: persisted.perAuditReportPaths,
			reportPath: persisted.perAuditReportPaths[auditName],
			skippedLedgerLines: persisted.skippedLedgerLines,
			suppressedDismissedCount: persisted.suppressedDismissedCount,
			suppressedDuplicateCount: persisted.suppressedDuplicateCount,
			...progress.artifacts,
		},
		...progress.completion,
		summary: [auditSummary, warning, progress.summary]
			.filter((line): line is string => line !== undefined)
			.join('\n'),
	};
}

async function processAuditResult(
	plan: RunPlan,
	state: AuditRunState,
	context: ModeContext,
	result: AgentRunResult,
): Promise<ModeResult> {
	if (result.skipped || result.selectedWork?.kind === 'none') {
		return await noWorkResult(plan, state, context);
	}
	const auditName = selectedAuditName(plan, result.selectedWork);
	const reason = sessionFailureReason(result);
	if (reason !== undefined) {
		return await failedSessionResult(plan, state, context, auditName, { reason, result });
	}
	const persisted = await persistAuditReports({
		...(context.findingLedgerStore ? { ledgerStore: context.findingLedgerStore } : {}),
		projectDir: context.projectDir,
		...(context.runId ? { runId: context.runId } : {}),
		selectedAudits: [auditName],
		simulated: plan.simulation,
		store: context.store,
		structured: result.structuredResult,
	});
	return await persistedSessionResult(plan, state, context, auditName, persisted);
}

async function selectAuditWork(
	plan: RunPlan,
	state: AuditRunState,
	context: ModeContext,
): Promise<SelectedWork> {
	const requested = await requestedAudits(plan, state, context);
	// A run that stopped itself hands out nothing more, whatever is still pending: the session
	// that tripped the limit can be one the timeout policy retries, and that retry must not
	// reach the next audit.
	const [auditName] =
		state.totals.stoppedAfterFailures === undefined
			? await pendingAuditNames(plan, context, requested, settledAudits(state.totals))
			: [];
	if (auditName === undefined) {
		return {
			data: { audits: requested },
			description: noWorkSummary(state),
			id: 'no-work',
			kind: 'none',
		};
	}
	return {
		data: { ...plan.audit, current: auditName },
		description: `Run ${auditName} audit`,
		id: auditName,
		kind: 'generic',
	};
}

async function buildAuditPromptPlan(
	plan: RunPlan,
	state: AuditRunState,
	context: ModeContext,
	work: SelectedWork,
): Promise<PromptPlan> {
	// The run record names the run's whole worklist — set once at the first session, not
	// overwritten each session with whichever single audit that session happens to hold. It is
	// the worklist and not everything `--audit-all` resolved: a fresh audit the run never touches
	// did not drive it. Which of these audits the run actually performed is a separate record,
	// the per-audit finding counts, and that is what audit scoring credits.
	if (!state.driverRecorded) {
		const requested = await requestedAudits(plan, state, context);
		const worklist = await pendingAuditNames(plan, context, requested, new Set());
		await setAuditRunDriver(plan, context.rootDir ?? process.cwd(), worklist);
		state.driverRecorded = true;
	}
	// Audit findings are themselves features and can carry dependencies, so the topology is
	// built over the full inventory — excluding them would understate the fan-in of anything a
	// prior audit already flagged.
	const features = await context.store.listFeatures({ includeAudit: true });
	return {
		...plan.prompt,
		variables: {
			...plan.prompt.variables,
			auditName: selectedAuditName(plan, work),
			featureTopology: buildDependencyTopology(features),
		},
	};
}

/**
 * Audit mode: one audit per agent session, always. `--audit A,B,C` and `--audit-all` both name a
 * set, and the run works through it one audit at a time; no session is ever handed more than one.
 * @param plan The run plan carrying the audit selection.
 * @returns The mode handler, holding this run's progress between sessions.
 */
export function createAuditMode(plan: RunPlan): ModeHandler {
	const state = createAuditRunState();
	return {
		buildPromptPlan: (context: ModeContext, work: SelectedWork) =>
			buildAuditPromptPlan(plan, state, context, work),
		async isComplete(_context: ModeContext, result: ModeResult): Promise<boolean> {
			return result.complete;
		},
		name: 'audit',
		processResult: (context: ModeContext, result: AgentRunResult) =>
			processAuditResult(plan, state, context, result),
		selectWork: (context: ModeContext) => selectAuditWork(plan, state, context),
		async summarize(_context: ModeContext, result: ModeResult): Promise<ModeSummary> {
			return { text: result.summary };
		},
	};
}
