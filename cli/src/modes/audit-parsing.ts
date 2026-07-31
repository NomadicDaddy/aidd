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
	if (!Array.isArray(raw)) return [];
	// Defense in depth: findingValidationReasons rejects whole reports containing
	// non-object entries before they get here, but normalizeFinding must never be
	// able to throw on a null/primitive entry reaching it out-of-band.
	return raw.filter(
		(entry): entry is AuditFindingInput => typeof entry === 'object' && entry !== null,
	);
}

const findingSeverities = new Set(['critical', 'high', 'low', 'medium']);

/**
 * Structural validation of a report's findings array against the emitted result
 * contract (see prompts/compile/result-contract.ts): every entry must be an object
 * carrying a title, a spec, a description with a `Verified:` evidence line, a
 * recognized severity, and at least one affected file. A report violating any of
 * these is rejected whole — partial acceptance would persist a report whose prose
 * claims N findings while entries were silently dropped.
 */
export function findingValidationReasons(structured: Record<string, unknown>): string[] {
	const raw = structured.auditFindings ?? structured.findings;
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) return ['auditFindings is not an array'];
	const reasons: string[] = [];
	for (const [index, entry] of raw.entries()) {
		const label = `auditFindings[${index}]`;
		if (typeof entry !== 'object' || entry === null) {
			reasons.push(`${label}: not an object`);
			continue;
		}
		const finding = entry as Record<string, unknown>;
		if (stringValue(finding.title) === undefined) reasons.push(`${label}: missing title`);
		if (stringValue(finding.spec) === undefined) reasons.push(`${label}: missing spec`);
		const description = stringValue(finding.description);
		if (description === undefined) {
			reasons.push(`${label}: missing description`);
		} else if (!description.includes('Verified:')) {
			reasons.push(`${label}: description lacks a Verified: evidence line`);
		}
		const severity = stringValue(finding.auditSeverity) ?? stringValue(finding.severity);
		if (severity === undefined || !findingSeverities.has(severity.toLowerCase())) {
			reasons.push(`${label}: severity must be Critical, High, Medium, or Low`);
		}
		const affectedFiles = Array.isArray(finding.affectedFiles) ? finding.affectedFiles : [];
		if (!affectedFiles.some((file) => typeof file === 'string' && file.trim() !== '')) {
			reasons.push(`${label}: affectedFiles must name at least one file`);
		}
	}
	return reasons;
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
	// A justification shorter than a sentence can't describe what was checked and how.
	if (justification.trim().length < 50) return false;

	const namesConcretePath =
		/\b[\w./\\-]+\.(?:css|html|js|jsx|json|md|sql|ts|tsx|toml|ya?ml)\b/i.test(justification) ||
		/(?:\*\*?\/|\*\.|\/\*|\b[\w.-]+\/[\w./*-]+)/.test(justification);
	// Naming a tool alone ("I ran git status") proves nothing was actually swept;
	// a tool mention only counts as evidence alongside the paths/globs it covered.
	return namesConcretePath;
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
		const auditName = selectedAudits[0] ?? 'AUDIT';
		const reasons = findingValidationReasons(structured);
		if (reasons.length > 0) {
			return {
				invalid: [
					{ auditName, index: 0, reason: `invalid auditFindings: ${reasons.join('; ')}` },
				],
				reports: [],
			};
		}
		return {
			invalid: [],
			reports: [{ auditName, structured }],
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
		const reasons = findingValidationReasons(record);
		if (reasons.length > 0) {
			invalid.push({
				auditName,
				index,
				reason: `invalid auditFindings: ${reasons.join('; ')}`,
			});
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
