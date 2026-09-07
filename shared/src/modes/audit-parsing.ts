import {
	type AuditFindingInput,
	type AuditReportInput,
	type InvalidAuditReport,
	type NormalizedAuditFinding,
	stringValue,
} from './audit-shared.ts';

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

const concretePathPattern = /\b[\w./\\*-]+\.(?:css|html|js|jsx|json|md|sql|ts|tsx|toml|ya?ml)\b/i;
// A cited source location. The filename is either dotted (`routes.ts`, and also the
// extensionless dotfiles a repository actually carries: `.gitignore`, `.env.example`)
// or bare but qualified by a directory (`docker/Dockerfile`) — a bare undotted token
// never qualifies on its own, so prose like a `14:30` timestamp cannot pose as a
// citation. The location accepts a line, a `28-30` range, or a `12:5` line:column.
const pathLinePattern =
	/(?:[A-Za-z]:[\\/])?(?:[\w.@+-]+[\\/])*(?:[\w@+-]*\.[\w@+-]+(?:\.[\w@+-]+)*|(?<=[\\/])[\w@+-]+):\d+(?:-\d+|:\d+)?\b/;
// Directory and glob scopes: `dist/`, `cli/src/**`, `**/*.ts`, `*.json`. Deliberately
// loose — it also matches prose containing a slash (`TypeScript/JSX`, `tests/build`).
// Tightening it to require a closing separator was tried and rejected: it turned four
// substantive reports into false rejections. It is one of several ways to name a scope,
// not a gate on its own; the corroboration count below is what carries the weight.
const scopePattern = /(?:\*\*?\/|\*\.|\/\*|\b[\w.-]+\/[\w./*-]+)/;
// Artifacts a repository carries under a well-known name with no extension to match on.
// These are what a path-shaped pattern structurally cannot see.
const wellKnownArtifactPattern =
	/\b(?:CHANGELOG|Dockerfile|docker-compose|LICEN[CS]E|Makefile|README|bunfig|package(?:\s+(?:manifests?|metadata|scripts))?|tsconfig|\.env(?:\.\w+)?|\.gitignore|\.prettierignore|\.github\/workflows)\b/i;
// A named tool or script invocation is itself a concrete scope: it states what was run.
// The result contract explicitly invites "commands you inspected", so refusing to accept
// one as a scope rejected justifications the prompt had asked for.
const namedCommandPattern =
	/\b(?:bun\s+(?:run|test|x)|eslint|findstr|glob|grep|knip|lighthouse|npm\s+run|prettier|rg|ripgrep|smoke:qc|tsc|typecheck|wc)\b/i;
const inspectionVerbPattern =
	/\b(?:analy[sz]ed|attempted|audited|checked|compared|confirmed|counted|crawled|diffed|enumerated|examined|globbed|grepped|inspected|inventoried|measured|parsed|profiled|queried|read|reviewed|sampled|scanned|searched|surveyed|synthesi[sz]e[sd]?|traced|validated|verified|walked)\b/i;
const outcomeWordPattern =
	/\b(?:absent|are on|clean|confirmed|exist|exists|failed|found|inapplicable|is enabled|is on|matched|matches|no\s+\w+|none|not applicable|nothing|observed|passed|produced|qualified|recorded|remain|reported|returned|showed|within budget|yielded|zero\s+\w+)\b/i;

function verifiedEvidenceLines(description: string): string[] {
	return description
		.split(/\r?\n/)
		.map((line) => /^\s*Verified:\s*(.+)\s*$/i.exec(line)?.[1]?.trim())
		.filter((line): line is string => line !== undefined && line.length > 0);
}

function describesSearchEvidence(evidence: string): boolean {
	const namesSearch = /\b(?:findstr|grep|rg|ripgrep|scanned|scanning|searched|searching)\b/i.test(
		evidence,
	);
	const namesResult =
		/\b(?:confirmed|found|matched|matches|no|none|reported|resulted|returned|showed|yielded|zero)\b/i.test(
			evidence,
		);
	return namesSearch && namesResult && concretePathPattern.test(evidence);
}

/**
 * A measurement stands as evidence when it names the artifact measured, the act of
 * measuring, and the value that came back — `measured src/lib/archive-lock.ts at 297
 * lines`. Size, count, and duration findings have no single line to point at, so
 * without this form they cannot cite themselves and a true finding is rejected.
 */
function describesMeasurementEvidence(evidence: string): boolean {
	const namesMeasurement =
		/\b(?:benchmarked|clocked|counted|measured|measures|profiled|sized|timed)\b/i.test(
			evidence,
		);
	return namesMeasurement && /\d/.test(evidence) && concretePathPattern.test(evidence);
}

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
		} else {
			const evidenceLines = verifiedEvidenceLines(description);
			if (evidenceLines.length === 0) {
				reasons.push(`${label}: description lacks a non-empty Verified: evidence line`);
			} else if (
				!evidenceLines.some(
					(evidence) =>
						pathLinePattern.test(evidence) ||
						describesSearchEvidence(evidence) ||
						describesMeasurementEvidence(evidence),
				)
			) {
				reasons.push(
					`${label}: Verified: evidence must cite path:line, a scoped search and its result, or a measured artifact and its value`,
				);
			}
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

	// One hard requirement: the justification must point at something real. Three mandatory
	// lexical whitelists were tried first and failed closed on phrasing their author had not
	// anticipated — back-testing against 367 justifications agents actually wrote rejected 37%
	// of them, three quarters on the inspection verb alone ("Ran bun run smoke:qc and
	// observed…", "Grep TODO|FIXME over {backend,frontend}/src: no debt markers"). Requiring a
	// named scope and then corroboration keeps the floor without guessing every verb.
	const namesArtifact =
		concretePathPattern.test(justification) ||
		wellKnownArtifactPattern.test(justification) ||
		namedCommandPattern.test(justification) ||
		scopePattern.test(justification);
	if (!namesArtifact) return false;

	// At least two independent signals that something was actually done and something came
	// back. This establishes a minimum evidence shape, not semantic truth: a long sentence
	// that merely names a file still cannot make a failed audit fresh.
	const corroborations = [
		inspectionVerbPattern.test(justification),
		outcomeWordPattern.test(justification),
		namedCommandPattern.test(justification),
		/\b\d+\b/.test(justification),
	].filter(Boolean).length;
	return corroborations >= 2;
}

function auditReportValidationReasons(structured: Record<string, unknown>): string[] {
	const reasons = findingValidationReasons(structured);
	const raw = structured.auditFindings ?? structured.findings;
	if (raw === undefined) {
		reasons.push('missing auditFindings array');
	} else if (
		Array.isArray(raw) &&
		raw.length === 0 &&
		!hasMeaningfulNoFindingsJustification(structured)
	) {
		reasons.push(
			'empty auditFindings requires a concrete noFindingsJustification with scope, inspection, and outcome evidence',
		);
	}
	return reasons;
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
		const reasons = auditReportValidationReasons(structured);
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
		const reasons = auditReportValidationReasons(record);
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
