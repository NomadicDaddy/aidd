import {
	type AuditInstrument,
	auditInstrumentKinds,
	type RejectedAuditInstrument,
	stringValue,
} from 'aidd-shared/modes/audit-shared';

/**
 * Audits whose report score is a measurement claim rather than a judgement call.
 * A PERFORMANCE report that admits "no crawltest.json or stats.html present" and
 * then prints 84/100 is asserting a number nothing measured, so these audits must
 * declare the instrument that produced the number.
 */
export const measurementAudits: ReadonlySet<string> = new Set([
	'BUILD_OUTPUT',
	'LIGHTHOUSE',
	'PERFORMANCE',
]);

export const withheldScoreValue = 'SKIPPED / data-unavailable';

const requiredInstrumentFields = ['evidence', 'kind', 'measured', 'name', 'target'] as const;

const scoreValuePattern = String.raw`\d+(?:\.\d+)?(?:[ \t]*\/[ \t]*\d+(?:\.\d+)?)?`;
const linePrefixPattern = String.raw`[ \t]*(?:(?:#{1,6}|[-*+])[ \t]+)?`;
const labelPattern = String.raw`[A-Za-z ]*Score`;
const markdownHeadingPattern = /^(?:#{1,6})[ \t]+(.+?)[ \t]*$/;
const scoreSectionTitlePattern = /\bscores?\b/i;
const scoreTableCellPattern = new RegExp(
	String.raw`^([ \t]*(?:\*\*|__)?)${scoreValuePattern}((?:\*\*|__)?(?:[ \t]*\([^)]*\))?[ \t]*)$`,
);

/**
 * A labelled score line is anchored to the line start and requires digits so an
 * existing `N/A` is left alone. Two shapes qualify:
 *
 * 1. A bold label — `**Overall Score:** 92/100`, `**Overall Score**: 90/100`,
 *    `**Overall Performance Score:** 84/100`, `- **Score:** 20/25`. Emphasis marks
 *    the line as a report field, so trailing commentary after the number is allowed
 *    and the score is still rewritten.
 * 2. A plain label whose line holds nothing but the score — `Overall Score: 84/100`.
 *    Without emphasis the end anchor is what distinguishes a field from a sentence
 *    that happens to contain the words ("... mid-sentence the Overall Score: 84/100
 *    was quoted"), so a plain label followed by more prose is deliberately not a
 *    score declaration.
 */
const scoreLinePatterns = [
	new RegExp(
		String.raw`^(${linePrefixPattern}(?:\*\*|__)${labelPattern}[ \t]*(?:\*\*|__)?[ \t]*:[ \t]*(?:\*\*|__)?[ \t]*)${scoreValuePattern}`,
	),
	new RegExp(
		String.raw`^(${linePrefixPattern}${labelPattern}[ \t]*:[ \t]*)${scoreValuePattern}(?=[ \t]*\.?[ \t]*$)`,
	),
];

function withheldScoreLine(line: string): string | undefined {
	for (const pattern of scoreLinePatterns) {
		const rewritten = line.replace(pattern, `$1${withheldScoreValue}`);
		if (rewritten !== line) return rewritten;
	}
	return undefined;
}

function withheldScoreTableLine(line: string): string | undefined {
	if (!line.trimStart().startsWith('|')) return undefined;
	const rewritten = line
		.split('|')
		.map((cell) => cell.replace(scoreTableCellPattern, `$1${withheldScoreValue}$2`))
		.join('|');
	return rewritten === line ? undefined : rewritten;
}

/**
 * Lighthouse declares its category scores in a table beneath an "Overall Score"
 * heading. Track heading context so numeric cells in that table are withheld while
 * unrelated metric tables, counts, and prose remain unchanged.
 */
function rewriteDeclaredScores(reportMarkdown: string): {
	reportMarkdown: string;
	withheld: boolean;
} {
	let inScoreSection = false;
	let withheld = false;
	const lines = reportMarkdown.split('\n').map((line) => {
		const rewrittenLine = withheldScoreLine(line);
		if (rewrittenLine !== undefined) {
			withheld = true;
			return rewrittenLine;
		}
		const heading = line.match(markdownHeadingPattern);
		if (heading) {
			inScoreSection = scoreSectionTitlePattern.test(heading[1] ?? '');
			return line;
		}
		if (!inScoreSection) return line;
		const rewrittenTableLine = withheldScoreTableLine(line);
		if (rewrittenTableLine === undefined) return line;
		withheld = true;
		return rewrittenTableLine;
	});
	return { reportMarkdown: lines.join('\n'), withheld };
}

export interface InstrumentEnforcement {
	rejected: RejectedAuditInstrument[];
	reportMarkdown: string;
	withheld: boolean;
}

export function structuredInstruments(structured: Record<string, unknown> | undefined): unknown[] {
	const raw = structured?.instruments;
	return Array.isArray(raw) ? raw : [];
}

/**
 * Splits declared instruments into the ones that back a score and the ones that do
 * not. Malformed entries are rejected with a reason, never thrown on: a bad
 * instrument must degrade to "unmeasured", not fail the whole audit run.
 */
export function validateInstruments(entries: readonly unknown[]): {
	rejected: RejectedAuditInstrument[];
	validated: AuditInstrument[];
} {
	const rejected: RejectedAuditInstrument[] = [];
	const validated: AuditInstrument[] = [];
	for (const [index, entry] of entries.entries()) {
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
			rejected.push({
				index,
				label: `instruments[${index}]`,
				reasons: ['entry is not an object'],
			});
			continue;
		}
		const record = entry as Record<string, unknown>;
		const reasons = requiredInstrumentFields
			.filter((field) => stringValue(record[field]) === undefined)
			.map((field) => `missing ${field}`);
		const kindValue = stringValue(record.kind);
		const kind = auditInstrumentKinds.find((candidate) => candidate === kindValue);
		if (kindValue !== undefined && kind === undefined) {
			reasons.push('invalid kind (expected artifact, probe, or script)');
		}
		if (record.verified !== true) reasons.push('verified is not true');
		const evidence = stringValue(record.evidence);
		const measured = stringValue(record.measured);
		const name = stringValue(record.name);
		const target = stringValue(record.target);
		// The undefined checks are redundant with `reasons` above; they are repeated
		// here because only an inline check narrows the values to string.
		if (
			reasons.length > 0 ||
			evidence === undefined ||
			kind === undefined ||
			measured === undefined ||
			name === undefined ||
			target === undefined
		) {
			rejected.push({ index, label: name ?? `instruments[${index}]`, reasons });
			continue;
		}
		validated.push({ evidence, kind, measured, name, target, verified: true });
	}
	return { rejected, validated };
}

export function declaresNumericScore(reportMarkdown: string): boolean {
	return rewriteDeclaredScores(reportMarkdown).withheld;
}

/**
 * Withholds every declared score in a measurement-audit report that has no
 * validated instrument behind it. The score value is rewritten in place (label and
 * markdown emphasis preserved) and the report keeps the rest of its prose, so the
 * agent's actual observations survive while the unbacked number does not.
 */
export function enforceInstrumentBackedScore(
	auditName: string,
	structured: Record<string, unknown> | undefined,
	reportMarkdown: string,
): InstrumentEnforcement {
	if (!measurementAudits.has(auditName)) {
		return { rejected: [], reportMarkdown, withheld: false };
	}
	const { rejected, validated } = validateInstruments(structuredInstruments(structured));
	if (validated.length > 0) {
		return { rejected, reportMarkdown, withheld: false };
	}
	const rewritten = rewriteDeclaredScores(reportMarkdown);
	if (!rewritten.withheld) return { rejected, reportMarkdown, withheld: false };
	return {
		rejected,
		reportMarkdown: `${rewritten.reportMarkdown.trimEnd()}\n${withheldScoreSection(auditName, rejected)}`,
		withheld: true,
	};
}

function withheldScoreSection(auditName: string, rejected: RejectedAuditInstrument[]): string {
	const rejectionLines =
		rejected.length === 0
			? ['No `instruments[]` entries were declared.']
			: [
					'Instruments declared but rejected:',
					'',
					...rejected.map((entry) => `- \`${entry.label}\`: ${entry.reasons.join('; ')}`),
				];
	return [
		'',
		'---',
		'',
		'## Score Withheld - No Validated Instrument',
		'',
		`${auditName} is a measurement audit, so aidd rewrote every score in this report to \`${withheldScoreValue}\`. A numeric score requires at least one \`instruments[]\` entry in the structured result with \`verified: true\` and a non-empty \`name\`, \`kind\`, \`target\`, \`evidence\`, and \`measured\`. This report declared none that validated.`,
		'',
		...rejectionLines,
		'',
	].join('\n');
}
