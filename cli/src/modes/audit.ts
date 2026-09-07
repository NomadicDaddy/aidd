import type {
	ModeContext,
	ModeHandler,
	ModeResult,
	ModeSummary,
	SelectedWork,
} from 'aidd-shared/modes/types';
import type { AgentRunResult } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import { buildDependencyTopology } from 'aidd-shared/metadata/features';
import { hasStructuredAuditOutput } from 'aidd-shared/modes/audit-parsing';
import { persistAuditReports } from 'aidd-shared/modes/audit-persist';

import { setAuditRunDriver } from '../run-driver.ts';
import {
	auditNames,
	auditNamesForSelection,
	currentAuditName,
	explicitAuditNames,
	remainingAfterResult,
	selectedAuditNames,
} from './audit-selection.ts';

export function createAuditMode(plan: RunPlan): ModeHandler {
	let explicitRetryAudits: string[] | undefined;

	return {
		async buildPromptPlan(context: ModeContext, work: SelectedWork) {
			const selectedAudits = selectedAuditNames(plan, work);
			await setAuditRunDriver(plan, context.rootDir ?? process.cwd(), selectedAudits);
			const auditName = selectedAudits[0] ?? currentAuditName(plan);
			// Audit findings are themselves features and can carry dependencies, so the topology is
			// built over the full inventory — excluding them would understate the fan-in of anything a
			// prior audit already flagged.
			const features = await context.store.listFeatures({ includeAudit: true });
			return {
				...plan.prompt,
				variables: {
					...plan.prompt.variables,
					auditBatchMode: selectedAudits.length > 1,
					auditName,
					auditNames: selectedAudits,
					featureTopology: buildDependencyTopology(features),
				},
			};
		},
		async isComplete(_context: ModeContext, result: ModeResult): Promise<boolean> {
			return result.complete;
		},
		name: 'audit',
		async processResult(context: ModeContext, result: AgentRunResult): Promise<ModeResult> {
			if (result.skipped || result.selectedWork?.kind === 'none') {
				return {
					artifacts: { remainingAudits: [] },
					complete: true,
					summary: 'all requested audits have reports',
				};
			}
			const selectedAudits = selectedAuditNames(plan, result.selectedWork);
			const auditName = selectedAudits[0] ?? currentAuditName(plan);
			const requestedAudits = await auditNames(plan, context);
			const auditBatchMode = selectedAudits.length > 1;
			const hasStructuredAuditResult = hasStructuredAuditOutput(
				result.structuredResult,
				auditBatchMode,
			);
			if (result.exitCode !== 0 || !hasStructuredAuditResult) {
				const reason =
					result.exitCode !== 0
						? `agent exited ${result.exitCode}`
						: 'no AIDD_RESULT structured output emitted';
				explicitRetryAudits =
					explicitAuditNames(plan).length > 0 ? selectedAudits : undefined;
				return {
					artifacts: {
						auditBatchMode,
						auditBatchParallelInstruction: auditBatchMode,
						auditFindings: {},
						auditName,
						completedAudits: [],
						failureReason: reason,
						findingsCreated: 0,
						findingsTotal: 0,
						invalidAuditReports: [],
						missingAudits: selectedAudits,
						perAuditFindingsCreated: {},
						perAuditFindingTotals: {},
						perAuditReportPaths: {},
						requestedAudits,
						selectedAuditBatch: selectedAudits,
					},
					complete: false,
					summary: auditBatchMode
						? `audit batch did not complete (${reason}); no reports written`
						: `audit ${auditName} did not complete (${reason}); no report written`,
				};
			}
			const persisted = await persistAuditReports({
				...(context.findingLedgerStore ? { ledgerStore: context.findingLedgerStore } : {}),
				projectDir: context.projectDir,
				...(context.runId ? { runId: context.runId } : {}),
				selectedAudits,
				simulated: plan.simulation,
				store: context.store,
				structured: result.structuredResult,
			});
			const {
				completedAudits,
				fileChanges: modeFileChanges,
				findingIds,
				perAuditFindingsCreated,
				perAuditFindingTotals,
				perAuditReportPaths,
				suppressedDismissedCount,
				suppressedDuplicateCount,
				totalCreated,
				totalFindings,
				unmeasuredScoresWithheld,
			} = persisted;

			const missingAudits = selectedAudits.filter((name) => !completedAudits.includes(name));
			const batchIncomplete = missingAudits.length > 0 || persisted.invalid.length > 0;
			const remaining = await remainingAfterResult(
				plan,
				context,
				selectedAudits,
				completedAudits,
				batchIncomplete,
			);
			explicitRetryAudits = explicitAuditNames(plan).length > 0 ? remaining : undefined;
			const complete = result.exitCode === 0 && remaining.length === 0 && !batchIncomplete;
			const duplicateCount = suppressedDuplicateCount;
			const findingSummaryParts = [`${totalCreated} new`];
			if (duplicateCount > 0) findingSummaryParts.push(`${duplicateCount} pre-existing`);
			if (suppressedDismissedCount > 0) {
				findingSummaryParts.push(`${suppressedDismissedCount} false-positive dismissed`);
			}
			const findingSummary = findingSummaryParts.join(', ');
			const remainingSuffix =
				remaining.length > 0 ? `; ${remaining.length} audit(s) remain` : '';
			const missingSuffix =
				missingAudits.length > 0 ? `; missing: ${missingAudits.join(', ')}` : '';
			const invalidCount = persisted.invalid.length;
			const invalidSuffix =
				invalidCount > 0
					? `; ${invalidCount} invalid report entr${invalidCount === 1 ? 'y' : 'ies'}`
					: '';
			// A torn or hand-edited ledger line is skipped rather than fatal; say so, because a
			// skipped resolution can re-create a finding that was already dismissed.
			const skippedLedgerSuffix =
				persisted.skippedLedgerLines > 0
					? `; ${persisted.skippedLedgerLines} malformed findings-ledger line(s) skipped`
					: '';
			const batchSummary = `audit batch finished ${completedAudits.length}/${selectedAudits.length} audit(s) with ${totalFindings} finding(s) (${findingSummary})${missingSuffix}${invalidSuffix}${skippedLedgerSuffix}${remainingSuffix}`;
			const preExistingSuffix =
				duplicateCount > 0 ? ` (${totalCreated} new, ${duplicateCount} pre-existing)` : '';
			const dismissedSuffix =
				suppressedDismissedCount > 0
					? `; ${suppressedDismissedCount} false-positive dismissal(s) suppressed`
					: '';
			const singleSummary = `audit ${auditName} finished with ${totalFindings} finding(s)${preExistingSuffix}${dismissedSuffix}${invalidSuffix}${skippedLedgerSuffix}${remainingSuffix}`;
			const baseSummary = auditBatchMode ? batchSummary : singleSummary;
			// A measurement audit can print a confident score while its own prose admits no
			// artifact was parsed. The score is rewritten in the report; surface the fact
			// here too so a run summary never reads clean when a number was withheld.
			const instrumentContractWarning =
				unmeasuredScoresWithheld > 0
					? `WARNING: ${unmeasuredScoresWithheld} measurement audit report(s) declared a numeric score with no validated instruments[] entry; each score was rewritten to SKIPPED / data-unavailable. Produce a real measurement artifact and re-run those audits.`
					: undefined;
			const summary = [baseSummary, instrumentContractWarning]
				.filter((line): line is string => line !== undefined)
				.join('\n');
			return {
				artifacts: {
					auditBatchMode,
					auditBatchParallelInstruction: auditBatchMode,
					auditFindings: perAuditFindingTotals,
					auditName,
					completedAudits,
					findingIds,
					findingsCreated: totalCreated,
					findingsTotal: totalFindings,
					instrumentContractWarning,
					invalidAuditReports: persisted.invalid,
					missingAudits,
					...modeFileChanges,
					perAuditFindingsCreated,
					perAuditFindingTotals,
					perAuditReportPaths,
					remainingAudits: remaining,
					reportPath: perAuditReportPaths[auditName],
					requestedAudits,
					selectedAuditBatch: selectedAudits,
					skippedLedgerLines: persisted.skippedLedgerLines,
					suppressedDismissedCount,
					suppressedDuplicateCount,
				},
				complete,
				summary,
			};
		},
		async selectWork(context: ModeContext): Promise<SelectedWork> {
			const selected = await auditNamesForSelection(plan, context, explicitRetryAudits);
			if (selected.length === 0) {
				return {
					data: { audits: await auditNames(plan, context) },
					description: 'all requested audits have reports',
					id: 'no-work',
					kind: 'none',
				};
			}
			if (selected.length === 1) {
				const auditName = selected[0]!;
				return {
					data: { ...plan.audit, current: auditName, currentBatch: selected },
					description: `Run ${auditName} audit`,
					id: auditName,
					kind: 'generic',
				};
			}
			return {
				data: { ...plan.audit, current: selected[0], currentBatch: selected },
				description: `Run ${selected.length} audits: ${selected.join(', ')}`,
				id: 'audit-batch',
				kind: 'generic',
			};
		},
		async summarize(_context: ModeContext, result: ModeResult): Promise<ModeSummary> {
			return { text: result.summary };
		},
	};
}
