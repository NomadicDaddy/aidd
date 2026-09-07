import type { AiddStore } from '../metadata/store.ts';
import type { InvalidAuditReport, NormalizedAuditFinding } from './audit-shared.ts';

import {
	createModeFileChanges,
	type ModeFileChanges,
	recordAuditFeatureCreated,
	recordAuditReportWrite,
	recordFindingLedgerWrite,
	recordRoadmapChangeSince,
	snapshotFindingLedger,
	snapshotRoadmap,
} from './audit-file-changes.ts';
import { disambiguateFeatureId, normalizeFinding } from './audit-findings.ts';
import { enforceInstrumentBackedScore } from './audit-instruments.ts';
import { structuredAuditReports, structuredFindings, structuredReport } from './audit-parsing.ts';
import { simulationMarker } from './audit-shared.ts';

export interface AuditPersistInput {
	ledgerStore?: AiddStore;
	projectDir: string;
	/** The run writing these reports; absent only for callers with no run identity. */
	runId?: string;
	/** The audit batch the run was launched with; only used to name a single unlabelled report. */
	selectedAudits: string[];
	/** Prefixes every report with the simulation banner when the launch explicitly selected it. */
	simulated: boolean;
	store: AiddStore;
	structured: Record<string, unknown> | undefined;
}

export interface AuditPersistResult {
	completedAudits: string[];
	fileChanges: ModeFileChanges;
	findingIds: string[];
	invalid: InvalidAuditReport[];
	perAuditFindingsCreated: Record<string, number>;
	perAuditFindingTotals: Record<string, number>;
	perAuditReportPaths: Record<string, string>;
	/** Ledger lines that could not be parsed and were ignored for this persist. */
	skippedLedgerLines: number;
	suppressedDismissedCount: number;
	suppressedDuplicateCount: number;
	totalCreated: number;
	totalFindings: number;
	unmeasuredScoresWithheld: number;
}

/**
 * Turn a parsed AIDD_RESULT into on-disk audit reports and backlog finding features.
 *
 * Shared because the CLI audit mode is not the only caller: when a run dies after the
 * agent emitted its result but before the mode could persist it, the web backend recovers
 * the payload from the run log and replays it through this exact function. The two paths
 * must produce byte-identical artifacts, so the loop lives here rather than in either.
 */
export async function persistAuditReports(input: AuditPersistInput): Promise<AuditPersistResult> {
	const { projectDir, runId, selectedAudits, simulated, store, structured } = input;
	const ledgerStore = input.ledgerStore ?? store;
	const parsed = structuredAuditReports(structured, selectedAudits);
	const completedAudits: string[] = [];
	const findingIds: string[] = [];
	const fileChanges = createModeFileChanges();
	const perAuditFindingTotals: Record<string, number> = {};
	const perAuditFindingsCreated: Record<string, number> = {};
	const perAuditReportPaths: Record<string, string> = {};
	let totalFindings = 0;
	let totalCreated = 0;
	let suppressedDismissedCount = 0;
	let suppressedDuplicateCount = 0;
	let unmeasuredScoresWithheld = 0;
	let existing = await store.listFeatures({ includeAudit: true });
	const ledger = await ledgerStore.readFindingLedger();
	const ledgerEvents = ledger.events;
	// Findings this same run already emitted: a crash-recovery replay of the run's payload
	// must recognize its own earlier writes instead of suppressing them as duplicates.
	const emittedByThisRun = new Map<string, string>();
	if (runId) {
		for (const event of ledgerEvents) {
			if (event.event === 'emitted' && event.runId === runId) {
				emittedByThisRun.set(event.fingerprint, event.featureId);
			}
		}
	}
	const takenIds = new Set(existing.map((feature) => feature.id));
	const findingLedgerExistedBefore = await snapshotFindingLedger(ledgerStore.projectDir);
	const roadmapBefore = await snapshotRoadmap(projectDir);

	for (const report of parsed.reports) {
		const findings = structuredFindings(report.structured);
		const normalized: NormalizedAuditFinding[] = [];
		let created = 0;
		const createdFindingReferences: { featureId: string; fingerprint: string }[] = [];
		for (const [index, rawFinding] of findings.entries()) {
			const finding = normalizeFinding(
				rawFinding,
				report.auditName,
				existing,
				index,
				ledgerEvents,
			);
			normalized.push(finding);
			const fingerprint = finding.feature.fingerprint;
			if (!fingerprint)
				throw new Error('Normalized audit finding is missing its fingerprint');
			const replayedFeatureId = emittedByThisRun.get(fingerprint);
			if (
				replayedFeatureId !== undefined &&
				existing.some((f) => f.id === replayedFeatureId)
			) {
				findingIds.push(replayedFeatureId);
				createdFindingReferences.push({ featureId: replayedFeatureId, fingerprint });
				created++;
				continue;
			}
			if (finding.disposition === 'suppress-duplicate') {
				await ledgerStore.appendFindingEvent({
					auditSource: report.auditName,
					event: 'suppressed-duplicate',
					featureId: requiredPriorFeatureId(finding),
					fingerprint,
					...(runId ? { runId } : {}),
				});
				suppressedDuplicateCount++;
				continue;
			}
			if (finding.disposition === 'suppress-dismissed') {
				await ledgerStore.appendFindingEvent({
					auditSource: report.auditName,
					event: 'suppressed-dismissed',
					featureId: requiredPriorFeatureId(finding),
					fingerprint,
					...(runId ? { runId } : {}),
				});
				suppressedDismissedCount++;
				continue;
			}
			finding.feature.id = disambiguateFeatureId(finding.feature.id, takenIds);
			takenIds.add(finding.feature.id);
			await store.writeFeature(finding.feature);
			await ledgerStore.appendFindingEvent({
				auditSource: report.auditName,
				event: 'emitted',
				featureId: finding.feature.id,
				fingerprint,
				...(runId ? { runId } : {}),
			});
			if (finding.disposition === 'recur') {
				await ledgerStore.appendFindingEvent({
					auditSource: report.auditName,
					event: 'recurred',
					featureId: finding.feature.id,
					fingerprint,
					priorFeatureId: requiredPriorFeatureId(finding),
					...(runId ? { runId } : {}),
				});
			}
			recordAuditFeatureCreated(fileChanges, projectDir, finding.feature.id);
			existing = [...existing, finding.feature];
			findingIds.push(finding.feature.id);
			createdFindingReferences.push({ featureId: finding.feature.id, fingerprint });
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
			fileChanges,
			projectDir,
			report.auditName,
			(timestamp) =>
				store.writeAuditReport(
					report.auditName,
					finalReport,
					timestamp,
					createdFindingReferences,
				),
		);

		completedAudits.push(report.auditName);
		perAuditFindingTotals[report.auditName] = findings.length;
		perAuditFindingsCreated[report.auditName] = created;
		perAuditReportPaths[report.auditName] = reportPath;
		totalFindings += findings.length;
		totalCreated += created;
	}
	if (totalFindings > 0) {
		recordFindingLedgerWrite(fileChanges, ledgerStore.projectDir, findingLedgerExistedBefore);
	}
	await recordRoadmapChangeSince(fileChanges, projectDir, roadmapBefore);

	return {
		completedAudits,
		fileChanges,
		findingIds,
		invalid: parsed.invalid,
		perAuditFindingsCreated,
		perAuditFindingTotals,
		perAuditReportPaths,
		skippedLedgerLines: ledger.skippedLines,
		suppressedDismissedCount,
		suppressedDuplicateCount,
		totalCreated,
		totalFindings,
		unmeasuredScoresWithheld,
	};
}

function requiredPriorFeatureId(finding: { disposition: string; priorFeatureId?: string }): string {
	if (finding.priorFeatureId) return finding.priorFeatureId;
	throw new Error(`Audit finding disposition ${finding.disposition} requires a prior feature id`);
}
