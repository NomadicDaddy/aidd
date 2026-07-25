import {
	type AuditFindingInput,
	type AuditReportInput,
	type InvalidAuditReport,
	type NormalizedAuditFinding,
	stringValue,
} from 'aidd-shared/modes/audit-shared';

export function structuredFindings(
	structured: Record<string, unknown> | undefined,
): AuditFindingInput[] {
	const raw = structured?.auditFindings ?? structured?.findings;
	return Array.isArray(raw) ? (raw as AuditFindingInput[]) : [];
}

export function hasMeaningfulNoFindingsJustification(
	structured: Record<string, unknown> | undefined,
): boolean {
	const justification = stringValue(structured?.noFindingsJustification);
	if (justification === undefined) return false;

	const normalized = justification
		.toLowerCase()
		.replace(/[.!?]+$/g, '')
		.trim();
	if (
		/^(?:no|zero) (?:issues|findings|problems)(?: found)?$/.test(normalized) ||
		normalized === 'looks clean' ||
		normalized === 'code is fine'
	) {
		return false;
	}

	return (
		/\b[\w./\\-]+\.(?:css|html|js|jsx|json|md|sql|ts|tsx|toml|ya?ml)\b/i.test(justification) ||
		/(?:\*\*?\/|\*\.|\/\*|\b[\w.-]+\/[\w./*-]+)/.test(justification) ||
		/\b(?:rg|grep|findstr|select-string|git|bun|npm|pnpm|yarn)\b/i.test(justification)
	);
}

export function hasStructuredAuditOutput(
	structured: Record<string, unknown> | undefined,
	auditBatchMode: boolean,
): boolean {
	if (structured === undefined) return false;
	if (Array.isArray(structured.auditReports)) return true;
	return !auditBatchMode && ('auditFindings' in structured || 'findings' in structured);
}

export function structuredAuditReports(
	structured: Record<string, unknown> | undefined,
	selectedAudits: string[],
): { invalid: InvalidAuditReport[]; reports: AuditReportInput[] } {
	if (!structured) return { invalid: [], reports: [] };
	const rawReports = structured.auditReports;
	if (!Array.isArray(rawReports)) {
		return {
			invalid: [],
			reports: [
				{
					auditName: selectedAudits[0] ?? 'AUDIT',
					structured,
				},
			],
		};
	}
	const selected = new Set(selectedAudits);
	const seen = new Set<string>();
	const invalid: InvalidAuditReport[] = [];
	const reports: AuditReportInput[] = [];
	for (const [index, rawReport] of rawReports.entries()) {
		if (typeof rawReport !== 'object' || rawReport === null) {
			invalid.push({ index, reason: 'report entry is not an object' });
			continue;
		}
		const record = rawReport as Record<string, unknown>;
		const auditName = stringValue(record.auditName);
		if (!auditName) {
			invalid.push({ index, reason: 'missing auditName' });
			continue;
		}
		if (!selected.has(auditName)) {
			invalid.push({ auditName, index, reason: 'auditName was not selected' });
			continue;
		}
		if (seen.has(auditName)) {
			invalid.push({ auditName, index, reason: 'duplicate auditName' });
			continue;
		}
		seen.add(auditName);
		reports.push({ auditName, structured: record });
	}
	return { invalid, reports };
}

export function structuredReport(
	structured: Record<string, unknown> | undefined,
	auditName: string,
	findings: NormalizedAuditFinding[],
	created: number,
): string {
	if (typeof structured?.reportMarkdown === 'string') return structured.reportMarkdown;
	const findingLines = findings.map(
		(finding) => `- ${finding.feature.id}: ${finding.feature.title ?? 'Untitled'}`,
	);
	return [
		`# ${auditName} Audit Report`,
		'',
		`Findings created: ${created}`,
		`Findings supplied: ${findings.length}`,
		'',
		'## Findings',
		findingLines.length > 0 ? findingLines.join('\n') : 'No findings supplied.',
		'',
	].join('\n');
}
