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
	noWorkSummary,
	recordFailedAttempt,
	requestedAudits,
	runProgress,
} from './audit-run-state.ts';
import { pendingAuditNames, selectedAuditName } from './audit-selection.ts';
import {
	auditFailureSummary,
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

async function failedSessionResult(
	plan: RunPlan,
	state: AuditRunState,
	context: ModeContext,
	auditName: string,
	reason: string,
): Promise<ModeResult> {
	const attempt = recordFailedAttempt(state, auditName);
	const progress = await runProgress(plan, state, context);
	return {
		artifacts: {
			auditFindings: {},
			auditName,
			completedAudits: [],
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
		complete: false,
		summary: `${auditFailureSummary(auditName, reason, attempt)}\n${progress.summary}`,
	};
}

// Settles the audit against the run: done, unable to run, or — when validation rejected the
// report and nothing was written — one more failed attempt.
function settlePersistedAudit(
	state: AuditRunState,
	auditName: string,
	persisted: AuditPersistResult,
): string {
	const { totals } = state;
	totals.findingsCreated += persisted.totalCreated;
	totals.findingsTotal += persisted.totalFindings;
	const unavailable = persisted.unavailableAudits.find((audit) => audit.auditName === auditName);
	if (unavailable !== undefined) {
		totals.unavailable.push(unavailable);
		return auditResultSummary(auditName, persisted, unavailable);
	}
	if (persisted.completedAudits.includes(auditName)) {
		totals.completed.push(auditName);
		return auditResultSummary(auditName, persisted, undefined);
	}
	const attempt = recordFailedAttempt(state, auditName);
	return auditFailureSummary(auditName, 'report rejected by validation', attempt);
}

async function persistedSessionResult(
	plan: RunPlan,
	state: AuditRunState,
	context: ModeContext,
	auditName: string,
	persisted: AuditPersistResult,
): Promise<ModeResult> {
	const auditSummary = settlePersistedAudit(state, auditName, persisted);
	const progress = await runProgress(plan, state, context);
	const warning = instrumentContractWarning(persisted);
	const reportPath = persisted.perAuditReportPaths[auditName];
	return {
		artifacts: {
			auditFindings: persisted.perAuditFindingTotals,
			auditName,
			completedAudits: persisted.completedAudits,
			findingIds: persisted.findingIds,
			findingsCreated: persisted.totalCreated,
			findingsTotal: persisted.totalFindings,
			instrumentContractWarning: warning,
			invalidAuditReports: persisted.invalid,
			missingAudits: reportPath === undefined ? [auditName] : [],
			...persisted.fileChanges,
			perAuditFindingsCreated: persisted.perAuditFindingsCreated,
			perAuditFindingTotals: persisted.perAuditFindingTotals,
			perAuditReportPaths: persisted.perAuditReportPaths,
			reportPath,
			skippedLedgerLines: persisted.skippedLedgerLines,
			suppressedDismissedCount: persisted.suppressedDismissedCount,
			suppressedDuplicateCount: persisted.suppressedDuplicateCount,
			...progress.artifacts,
		},
		complete: progress.remainingAudits.length === 0,
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
		return {
			artifacts: {
				abandonedAudits: [...state.totals.abandoned],
				remainingAudits: [],
				unavailableAudits: [...state.totals.unavailable],
			},
			complete: true,
			summary: noWorkSummary(state),
		};
	}
	const auditName = selectedAuditName(plan, result.selectedWork);
	const failure = sessionFailureReason(result);
	if (failure !== undefined) {
		return await failedSessionResult(plan, state, context, auditName, failure);
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
	const [auditName] = await pendingAuditNames(
		plan,
		context,
		requested,
		settledAudits(state.totals),
	);
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
	// the worklist and not everything `--audit-all` resolved: audit scoring reads every name here
	// as an audit this run performed, so a fresh audit the run never touches must not be on it.
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
