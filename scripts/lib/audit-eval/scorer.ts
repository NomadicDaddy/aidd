import { existsSync } from 'node:fs';
import path from 'node:path';

import type {
	AuditEvalCatalog,
	AuditEvalRunScore,
	AuditEvalSite,
	EvaluationResult,
} from '../benchmark/types.ts';

import { listFiles } from '../benchmark/execution.ts';
import { clampScore } from '../benchmark/shared.ts';
import { isRecord, readJsonUnknown, stringArray, stringValue } from '../benchmark/validation.ts';

export interface ReportedAuditFinding {
	files: string[];
	id: string;
	/** Line numbers the finding cites, as `file.ts:12` or `line 12`, in document order. */
	lines: number[];
	/** The finding's own words: title, description, notes, and affected files. Never its id or status. */
	text: string;
}

function normalize(value: string): string {
	return value.trim().replaceAll('\\', '/').toLowerCase();
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A symbol counts as named only as a whole identifier: `health` does not match `healthy`. */
function namesSymbol(text: string, symbol: string): boolean {
	return new RegExp(`(^|[^a-z0-9_$])${escapeRegExp(symbol.toLowerCase())}(?![a-z0-9_$])`).test(
		text,
	);
}

function citedLines(text: string): number[] {
	const lines: number[] = [];
	for (const match of text.matchAll(/(?:\.[a-z0-9]+:|\blines?\s+)(\d{1,6})\b/gi)) {
		lines.push(Number(match[1]));
	}
	return lines;
}

/**
 * A finding is credited for a site only when it names the cataloged file, points at the cataloged
 * location (the symbol by name, or a line within the tolerance of the cataloged line), and uses one
 * of the site's aliases. Keyword presence alone, anywhere in the same file, is not a catch.
 */
export function findingMatchesSite(
	finding: ReportedAuditFinding,
	site: AuditEvalSite,
	lineTolerance: number,
): boolean {
	const text = normalize(finding.text);
	const expectedFile = normalize(site.file);
	const fileMatches =
		finding.files.some((file) => normalize(file) === expectedFile) ||
		text.includes(expectedFile);
	if (!fileMatches) return false;
	const localityMatches =
		site.symbol !== undefined
			? namesSymbol(text, site.symbol)
			: site.line !== undefined &&
				finding.lines.some((line) => Math.abs(line - (site.line ?? 0)) <= lineTolerance);
	if (!localityMatches) return false;
	return site.aliases.some((alias) => text.includes(normalize(alias)));
}

function findingText(record: Record<string, unknown>): string {
	const notes = Array.isArray(record.notes)
		? stringArray(record.notes)
		: typeof record.notes === 'string'
			? [record.notes]
			: [];
	return [
		stringValue(record.title) ?? '',
		stringValue(record.description) ?? '',
		...notes,
		...stringArray(record.affectedFiles),
	].join('\n');
}

export function collectReportedAuditFindings(
	workspaceDir: string,
	auditId: string,
): ReportedAuditFinding[] {
	const featuresDir = path.join(workspaceDir, '.aidd', 'features');
	if (!existsSync(featuresDir)) return [];
	const findings: ReportedAuditFinding[] = [];
	for (const filePath of listFiles(featuresDir).filter((file) => file.endsWith('feature.json'))) {
		try {
			const record = readJsonUnknown(filePath);
			if (!isRecord(record) || stringValue(record.auditSource) !== auditId) continue;
			const id = stringValue(record.id) ?? path.basename(path.dirname(filePath));
			const text = findingText(record);
			findings.push({
				files: stringArray(record.affectedFiles),
				id,
				lines: citedLines(text),
				text,
			});
		} catch {
			// A malformed finding is not silently credited; the benchmark run retains it as uncataloged.
			findings.push({
				files: [],
				id: path.basename(path.dirname(filePath)),
				lines: [],
				text: '',
			});
		}
	}
	return findings.sort((left, right) => left.id.localeCompare(right.id));
}

export function scoreAuditFindings(
	catalog: AuditEvalCatalog,
	findings: ReportedAuditFinding[],
): EvaluationResult {
	const { lineTolerance, strictPrecision } = catalog.scoring;
	const matchedDefects = new Set<string>();
	const creditedFindingIds: string[] = [];
	const decoyFindingIds: string[] = [];
	const uncatalogedFindingIds: string[] = [];
	const notes: string[] = [];
	for (const finding of findings) {
		// Every defect is tested against every finding, so one consolidated finding that names two
		// planted defects credits both, and two findings on the same defect are both real catches.
		const defects = catalog.defects.filter((site) =>
			findingMatchesSite(finding, site, lineTolerance),
		);
		if (defects.length > 0) {
			creditedFindingIds.push(finding.id);
			for (const defect of defects) matchedDefects.add(defect.id);
			notes.push(
				`credited finding: ${finding.id} (${defects.map((defect) => defect.id).join(', ')})`,
			);
			continue;
		}
		const decoy = catalog.decoys.find((site) =>
			findingMatchesSite(finding, site, lineTolerance),
		);
		if (decoy) {
			decoyFindingIds.push(finding.id);
			notes.push(`decoy finding: ${finding.id} (decoy: ${decoy.id})`);
			continue;
		}
		uncatalogedFindingIds.push(finding.id);
		notes.push(`uncataloged finding: ${finding.id}`);
	}
	const matchedDefectIds = catalog.defects
		.map((defect) => defect.id)
		.filter((id) => matchedDefects.has(id));
	const missedDefectIds = catalog.defects
		.map((defect) => defect.id)
		.filter((id) => !matchedDefects.has(id));
	const spuriousFindingIds = [
		...decoyFindingIds,
		...(strictPrecision ? uncatalogedFindingIds : []),
	];
	const judged = creditedFindingIds.length + spuriousFindingIds.length;
	const precision = judged === 0 ? 0 : creditedFindingIds.length / judged;
	const recall = matchedDefectIds.length / catalog.defects.length;
	const weightTotal = catalog.scoring.precisionWeight + catalog.scoring.recallWeight;
	const score = clampScore(
		(precision * catalog.scoring.precisionWeight + recall * catalog.scoring.recallWeight) /
			weightTotal,
	);
	const auditEval: AuditEvalRunScore = {
		auditId: catalog.auditId,
		creditedFindingIds,
		decoyFindingIds,
		matchedDefectIds,
		missedDefectIds,
		precision,
		recall,
		spuriousFindingIds,
		uncatalogedFindingIds,
	};
	notes.push(
		...missedDefectIds.map((id) => `missed defect: ${id}`),
		`decoy hits: ${decoyFindingIds.length}`,
		`uncataloged findings: ${uncatalogedFindingIds.length}${strictPrecision ? ' (strict: counted against precision)' : ''}`,
		`precision: ${precision.toFixed(4)}`,
		`recall: ${recall.toFixed(4)}`,
	);
	return { auditEval, notes, score };
}

export function evaluateAuditEval(
	workspaceDir: string,
	catalog: AuditEvalCatalog | undefined,
): EvaluationResult {
	if (!catalog) return { notes: ['audit-eval task is missing its defect catalog'], score: 0 };
	return scoreAuditFindings(catalog, collectReportedAuditFindings(workspaceDir, catalog.auditId));
}
