import type { AiddStore } from '../metadata/store.ts';
import type {
	AuditReportInput,
	InvalidAuditReport,
	NormalizedAuditFinding,
	UnavailableAudit,
} from './audit-shared.ts';

import { templateRepoVersion } from '../metadata/template-ownership.ts';
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
import { enforceInstrumentBackedScore, withheldScoreValue } from './audit-instruments.ts';
import { structuredAuditReports, structuredFindings, structuredReport } from './audit-parsing.ts';
import { simulationMarker, unavailableMarker } from './audit-shared.ts';

export interface AuditPersistInput {
	ledgerStore?: AiddStore;
	projectDir: string;
	/** The run writing these reports; absent only for callers with no run identity. */
	runId?: string;
	/**
	 * The audits this result may belong to. The CLI passes the one audit the session was given;
	 * crash recovery passes every audit the dead run could have been on. The result's own
	 * `auditName` picks among them, and a result naming none of them is rejected.
	 */
	selectedAudits: readonly string[];
	/** Prefixes every report with the simulation banner when the launch explicitly selected it. */
	simulated: boolean;
	store: AiddStore;
	structured: Record<string, unknown> | undefined;
}

export interface AuditPersistResult {
	/** Audits that produced a report counting as evidence; a could-not-run audit is not one. */
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
	/** Audits whose report was written carrying the could-not-run marker, so they stay stale. */
	unavailableAudits: UnavailableAudit[];
	unmeasuredScoresWithheld: number;
}

const withheldScoreReason =
	'the report declared a numeric score with no validated instruments[] entry, so nothing measured it';

const selfDeclaredSkipReason = `the report states \`${withheldScoreValue}\`, so by its own account the audit was not performed`;

// An audit produced no usable evidence when the agent said it could not run, when a measurement
// audit printed a score that had to be withheld, or when the report itself carries the skipped
// status the methodology prescribes for an audit with no working instrument. The last case is
// read from the text and not trusted to the agent's `auditStatus`: a report that says it was
// skipped must never be what makes its audit current.
function unavailableReasonFor(
	report: AuditReportInput,
	scoreWithheld: boolean,
	reportMarkdown: string,
): string | undefined {
	if (report.unavailableReason !== undefined) {
		return report.unavailableReason.replace(/\s+/gu, ' ');
	}
	if (scoreWithheld) return withheldScoreReason;
	return reportMarkdown.includes(withheldScoreValue) ? selfDeclaredSkipReason : undefined;
}

// The marker is what keeps a could-not-run report from counting as fresh; the reason line is
// there for the person who opens the file to find out why the audit is still stale.
function finalReportContent(
	reportMarkdown: string,
	simulated: boolean,
	unavailableReason: string | undefined,
): string {
	const body =
		unavailableReason === undefined
			? reportMarkdown
			: `${unavailableMarker}\n> **Audit could not run:** ${unavailableReason}\n\n${reportMarkdown}`;
	return simulated ? `${simulationMarker}\n${body}` : body;
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
	const unavailableAudits: UnavailableAudit[] = [];
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
	const templateVersion = await templateRepoVersion(projectDir);

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
			// Inside the template repository every feature record declares the template version
			// that owns it, and the template's own gate fails on one that does not.
			if (templateVersion !== undefined)
				finding.feature['spernakit_version'] = templateVersion;
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
		const unavailableReason = unavailableReasonFor(report, enforced.withheld, reportMarkdown);
		const finalReport = finalReportContent(
			enforced.reportMarkdown,
			simulated,
			unavailableReason,
		);
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

		if (unavailableReason === undefined) {
			completedAudits.push(report.auditName);
		} else {
			unavailableAudits.push({ auditName: report.auditName, reason: unavailableReason });
		}
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
		unavailableAudits,
		unmeasuredScoresWithheld,
	};
}

function requiredPriorFeatureId(finding: { disposition: string; priorFeatureId?: string }): string {
	if (finding.priorFeatureId) return finding.priorFeatureId;
	throw new Error(`Audit finding disposition ${finding.disposition} requires a prior feature id`);
}
