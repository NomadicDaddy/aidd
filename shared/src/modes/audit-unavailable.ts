import { readFile } from 'node:fs/promises';

import type { AuditReportInput } from './audit-shared.ts';

import { auditReportPath, reportOpensWithMarker } from '../metadata/audit-freshness.ts';
import { declaresSkippedStatus, withheldScoreValue } from './audit-instruments.ts';
import { simulationMarker, unavailableMarker } from './audit-shared.ts';

const withheldScoreReason =
	'the report declared a numeric score with no validated instruments[] entry, so nothing measured it';

const selfDeclaredSkipReason = `the report declares its status as \`${withheldScoreValue}\`, so by its own account the audit was not performed`;

/**
 * Why an audit's result is not evidence, when it is not. An audit produced no usable evidence
 * when the agent said it could not run, when a measurement audit printed a score that had to be
 * withheld, or when the report's own status line carries the skipped status. The last case is
 * read from the text and not trusted to the agent's `auditStatus`: a report that says it was
 * skipped must never be what makes its audit current. Only the status line counts, because a
 * measured report may name the same phrase against one sub-metric it could not collect.
 * @param report The parsed result, carrying the reason the agent gave if it declared one.
 * @param scoreWithheld Whether a score in the report had to be withheld.
 * @param reportMarkdown The report text as the agent wrote it.
 * @returns The reason the audit could not run, or undefined when the report is evidence.
 */
export function unavailableReasonFor(
	report: AuditReportInput,
	scoreWithheld: boolean,
	reportMarkdown: string,
): string | undefined {
	if (report.unavailableReason !== undefined) {
		return report.unavailableReason.replace(/\s+/gu, ' ');
	}
	if (scoreWithheld) return withheldScoreReason;
	return declaresSkippedStatus(reportMarkdown) ? selfDeclaredSkipReason : undefined;
}

/**
 * The text written to the report file. The marker is what keeps a could-not-run report from
 * counting as fresh; the reason line is there for the person who opens the file to find out why
 * the audit is still stale. Both markers go on the leading lines, which is the only place a
 * freshness reader looks for them.
 * @param reportMarkdown The report text, with any unbacked score already withheld.
 * @param simulated Whether the launch explicitly selected simulation.
 * @param unavailableReason Why the audit could not run, when it could not.
 * @returns The report content, prefixed with the markers that apply.
 */
export function finalReportContent(
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
 * The report already written for this audit today, when it is real evidence. Reports are one
 * file per audit per day, so writing a could-not-run result would replace it: the real text
 * would be gone and the audit would read as never performed. A same-day report that is itself
 * marked could-not-run or simulated is not evidence and may be replaced.
 * @param projectDir The project whose reports are read.
 * @param auditName The audit about to be reported as could-not-run.
 * @returns The path of the real report to leave in place, or undefined when there is none.
 */
export async function sameDayEvidenceReport(
	projectDir: string,
	auditName: string,
): Promise<string | undefined> {
	const path = auditReportPath(projectDir, auditName, new Date());
	const existing = await readFile(path, 'utf8').catch(() => undefined);
	if (existing === undefined) return undefined;
	return reportOpensWithMarker(existing, [simulationMarker, unavailableMarker])
		? undefined
		: path;
}
