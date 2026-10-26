import { expect, test } from 'bun:test';
import { join } from 'node:path';

import type { ReportedAuditFinding } from '../../scripts/lib/audit-eval/scorer.ts';

import { resolveAuditSymbolSpans } from '../../scripts/lib/audit-eval/locality.ts';
import { findingMatchesSite, scoreAuditFindings } from '../../scripts/lib/audit-eval/scorer.ts';
import { loadManifest } from '../../scripts/lib/benchmark/manifest.ts';

const root = join(import.meta.dir, '..', '..');
const manifest = loadManifest(join(root, 'evals', 'audits', 'manifest.json'));
const catalog = manifest.tasks[0]!.auditEval!;
const spans = resolveAuditSymbolSpans(
	join(root, 'evals', 'audits', 'fixtures', 'security'),
	catalog,
);
const locality = { spans };
const html = catalog.defects.find((site) => site.symbol === 'renderDebugHtml')!;
const traversal = catalog.defects.find((site) => site.symbol === 'readUpload')!;

function finding(
	text: string,
	file = 'backend/src/server.ts',
	id = 'independent-finding',
): ReportedAuditFinding {
	return { files: [file], id, lines: [7], text };
}

test('the real fixture yields distinct function spans for all three defects and both decoys', () => {
	expect(spans.map(({ symbol, startLine, endLine }) => ({ symbol, startLine, endLine }))).toEqual(
		[
			{ symbol: 'renderDebugHtml', startLine: 6, endLine: 9 },
			{ symbol: 'isAdmin', startLine: 11, endLine: 13 },
			{ symbol: 'readUpload', startLine: 6, endLine: 8 },
			{ symbol: 'health', startLine: 15, endLine: 17 },
			{ symbol: 'publicAssetUrl', startLine: 10, endLine: 12 },
		],
	);
});

test('same-file evidence at the defect accepts a finding without its function identifier', () => {
	const result = scoreAuditFindings(
		catalog,
		[
			finding(
				'Verified: backend/src/server.ts:12 trusts caller-controlled x-admin without identity verification.',
				'backend/src/server.ts',
				'admin',
			),
			finding(
				'Verified: backend/src/server.ts:7-8 inserts unescaped query markup directly into HTML.',
				'backend/src/server.ts',
				'html',
			),
			finding(
				'Verified: backend/src/storage.ts:7 allows path traversal outside uploads.',
				'backend/src/storage.ts',
				'traversal',
			),
		],
		locality,
	);
	expect(result.auditEval?.precision).toBe(1);
	expect(result.auditEval?.recall).toBe(1);
	expect(result.auditEval?.uncatalogedFindingIds).toEqual([]);
	expect(result.auditEval?.decoyFindingIds).toEqual([]);
});

test.each([
	'Verified: backend/src/other.ts:7 permits XSS.',
	'Verified: /backend/src/server.ts:7 permits XSS outside the workspace.',
	'Verified: backend/src/server.ts:16 permits XSS in the health response.',
	'Verified: backend/src/server.ts:999 permits XSS.',
	'Verified: line 7 permits XSS somewhere in this file.',
	'backend/src/server.ts permits XSS, without a cited location.',
])('file-wide aliases and unrelated citations cannot claim the debug function: %s', (text) => {
	expect(findingMatchesSite(finding(text), html, 100, locality)).toBe(false);
});

test('a neighboring decoy remains a decoy even when it borrows a defect alias', () => {
	const candidate = finding(
		'Verified: backend/src/storage.ts:11 - publicAssetUrl permits path traversal.',
		'backend/src/storage.ts',
	);
	expect(findingMatchesSite(candidate, traversal, 100, locality)).toBe(false);
	const result = scoreAuditFindings(catalog, [candidate], locality);
	expect(result.auditEval?.matchedDefectIds).toEqual([]);
	expect(result.auditEval?.decoyFindingIds).toEqual(['independent-finding']);
	expect(result.auditEval?.precision).toBe(0);
});

test('a relative dot prefix still identifies the same source file', () => {
	expect(
		findingMatchesSite(
			finding('Verified: ./backend/src/server.ts:8 emits unescaped HTML.'),
			html,
			3,
			locality,
		),
	).toBe(true);
});

test('an id containing the symbol and alias cannot substitute for source evidence', () => {
	const candidate = { ...finding('Review the helper.'), id: 'renderDebugHtml-xss' };
	expect(findingMatchesSite(candidate, html, 3, locality)).toBe(false);
});

test('absolute citations must belong to this workspace and the cataloged file', () => {
	const workspaceDir = join(root, 'working-copy');
	const same = finding(`Verified: ${join(workspaceDir, html.file)}:7 permits XSS.`);
	const other = finding(`Verified: ${join(root, 'other-copy', html.file)}:7 permits XSS.`);
	expect(findingMatchesSite(same, html, 3, { spans, workspaceDir })).toBe(true);
	expect(findingMatchesSite(other, html, 3, { spans, workspaceDir })).toBe(false);
});

test('missing, ambiguous or absent span evidence never enables file-wide matching', () => {
	const candidate = finding('Verified: backend/src/server.ts:7 permits XSS.');
	expect(findingMatchesSite(candidate, html, 3)).toBe(false);
	expect(findingMatchesSite(candidate, html, 3, { spans: [] })).toBe(false);
	expect(findingMatchesSite(candidate, html, 3, { spans: [...spans, spans[0]!] })).toBe(false);
	expect(resolveAuditSymbolSpans(join(root, 'missing-fixture'), catalog)).toEqual([]);
	expect(resolveAuditSymbolSpans(root, undefined)).toEqual([]);
});
