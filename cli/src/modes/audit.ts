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
import { simulationMarker, simulationSignaturePhrase } from 'aidd-shared/modes/audit-shared';

import {
	createModeFileChanges,
	recordAuditFeatureCreated,
	recordAuditReportWrite,
	recordRoadmapChangeSince,
	snapshotRoadmap,
} from './audit-file-changes.ts';
import { disambiguateFeatureId, normalizeFinding } from './audit-findings.ts';
import { enforceInstrumentBackedScore } from './audit-instruments.ts';
import {
	hasMeaningfulNoFindingsJustification,
	hasStructuredAuditOutput,
	structuredAuditReports,
	structuredFindings,
	structuredReport,
} from './audit-parsing.ts';
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
			const parsedReports = structuredAuditReports(result.structuredResult, selectedAudits);
			const completedAudits: string[] = [];
			const findingIds: string[] = [];
			const modeFileChanges = createModeFileChanges();
			const perAuditFindingTotals: Record<string, number> = {};
			const perAuditFindingsCreated: Record<string, number> = {};
			const perAuditReportPaths: Record<string, string> = {};
			let totalFindings = 0;
			let totalCreated = 0;
			const unjustifiedEmptyAudits: string[] = [];
			let unmeasuredScoresWithheld = 0;
			let existing = await context.store.listFeatures({ includeAudit: true });
			const takenIds = new Set(existing.map((feature) => feature.id));
			const simulated = result.transcript.includes(simulationSignaturePhrase);
			const roadmapBefore = await snapshotRoadmap(context.projectDir);

			for (const report of parsedReports.reports) {
				const findings = structuredFindings(report.structured);
				if (
					findings.length === 0 &&
					!hasMeaningfulNoFindingsJustification(report.structured)
				) {
					unjustifiedEmptyAudits.push(report.auditName);
				}
				const normalized = findings.map((finding, index) =>
					normalizeFinding(finding, report.auditName, existing, index),
				);
				let created = 0;
				for (const finding of normalized) {
					if (finding.duplicate) continue;
					finding.feature.id = disambiguateFeatureId(finding.feature.id, takenIds);
					takenIds.add(finding.feature.id);
					await context.store.writeFeature(finding.feature);
					recordAuditFeatureCreated(
						modeFileChanges,
						context.projectDir,
						finding.feature.id,
					);
					existing = [...existing, finding.feature];
					findingIds.push(finding.feature.id);
					created++;
				}

				const reportMarkdown = structuredReport(
					report.structured,
					report.auditName,
					normalized,
					created,
				);
				const enforced = enforceInstrumentBackedScore(
					report.auditName,
					report.structured,
					reportMarkdown,
				);
				if (enforced.withheld) unmeasuredScoresWithheld++;
				const finalReport = simulated
					? `${simulationMarker}\n${enforced.reportMarkdown}`
					: enforced.reportMarkdown;
				const reportPath = await recordAuditReportWrite(
					modeFileChanges,
					context.projectDir,
					report.auditName,
					(timestamp) =>
						context.store.writeAuditReport(report.auditName, finalReport, timestamp),
				);

				completedAudits.push(report.auditName);
				perAuditFindingTotals[report.auditName] = findings.length;
				perAuditFindingsCreated[report.auditName] = created;
				perAuditReportPaths[report.auditName] = reportPath;
				totalFindings += findings.length;
				totalCreated += created;
			}
			await recordRoadmapChangeSince(modeFileChanges, context.projectDir, roadmapBefore);

			const missingAudits = selectedAudits.filter((name) => !completedAudits.includes(name));
			const batchIncomplete = missingAudits.length > 0 || parsedReports.invalid.length > 0;
			const remaining = await remainingAfterResult(
				plan,
				context,
				selectedAudits,
				completedAudits,
				batchIncomplete,
			);
			explicitRetryAudits = explicitAuditNames(plan).length > 0 ? remaining : undefined;
			const complete = result.exitCode === 0 && remaining.length === 0 && !batchIncomplete;
			const duplicateCount = totalFindings - totalCreated;
			const findingSummary =
				duplicateCount > 0
					? `${totalCreated} new, ${duplicateCount} pre-existing`
					: `${totalCreated} new`;
			const remainingSuffix =
				remaining.length > 0 ? `; ${remaining.length} audit(s) remain` : '';
			const missingSuffix =
				missingAudits.length > 0 ? `; missing: ${missingAudits.join(', ')}` : '';
			const invalidCount = parsedReports.invalid.length;
			const invalidSuffix =
				invalidCount > 0
					? `; ${invalidCount} invalid report entr${invalidCount === 1 ? 'y' : 'ies'}`
					: '';
			const batchSummary = `audit batch finished ${completedAudits.length}/${selectedAudits.length} audit(s) with ${totalFindings} finding(s) (${findingSummary})${missingSuffix}${invalidSuffix}${remainingSuffix}`;
			const preExistingSuffix =
				totalFindings > totalCreated
					? ` (${totalCreated} new, ${totalFindings - totalCreated} pre-existing)`
					: '';
			const singleSummary = `audit ${auditName} finished with ${totalFindings} finding(s)${preExistingSuffix}${invalidSuffix}${remainingSuffix}`;
			const baseSummary = auditBatchMode ? batchSummary : singleSummary;
			// An audit can finish with report prose but no findings because the backend
			// dropped the findings contract. Legitimately clean empty reports must justify
			// their zero-finding result with concrete evidence — in every report, whether
			// the run was a single audit or a batch, and regardless of what sibling
			// reports found.
			const findingsContractWarning =
				unjustifiedEmptyAudits.length > 0
					? `WARNING: ${unjustifiedEmptyAudits.length} audit report(s) had zero structured findings without acceptable noFindingsJustification evidence (${unjustifiedEmptyAudits.join(', ')}); their zero-finding claims are unverified. Review those report(s) manually or re-run on a backend that honors the findings contract.`
					: undefined;
			// A measurement audit can print a confident score while its own prose admits no
			// artifact was parsed. The score is rewritten in the report; surface the fact
			// here too so a run summary never reads clean when a number was withheld.
			const instrumentContractWarning =
				unmeasuredScoresWithheld > 0
					? `WARNING: ${unmeasuredScoresWithheld} measurement audit report(s) declared a numeric score with no validated instruments[] entry; each score was rewritten to SKIPPED / data-unavailable. Produce a real measurement artifact and re-run those audits.`
					: undefined;
			const summary = [baseSummary, findingsContractWarning, instrumentContractWarning]
				.filter((line): line is string => line !== undefined)
				.join('\n');
			return {
				artifacts: {
					auditBatchMode,
					auditBatchParallelInstruction: auditBatchMode,
					auditName,
					completedAudits,
					findingIds,
					findingsContractWarning,
					findingsCreated: totalCreated,
					findingsTotal: totalFindings,
					instrumentContractWarning,
					invalidAuditReports: parsedReports.invalid,
					missingAudits,
					...modeFileChanges,
					perAuditFindingsCreated,
					perAuditFindingTotals,
					perAuditReportPaths,
					remainingAudits: remaining,
					reportPath: perAuditReportPaths[auditName],
					requestedAudits,
					selectedAuditBatch: selectedAudits,
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
