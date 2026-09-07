import { describe, expect, test } from 'bun:test';

import type { AuditEvalCatalog, AuditEvalSite } from '../../scripts/lib/benchmark/types.ts';

import {
	findingMatchesSite,
	type ReportedAuditFinding,
	scoreAuditFindings,
} from '../../scripts/lib/audit-eval/scorer.ts';

// The scorer decides which audit findings are real catches. Each case here is one way a keyword
// match would be credited for free: the wrong symbol, a decoy wearing a defect's vocabulary, a
// slug that happens to contain an alias, or a line far from the planted one.

const HTML: AuditEvalSite = {
	aliases: ['xss', 'unescaped html'],
	auditId: 'SECURITY',
	file: 'backend/src/server.ts',
	id: 'unescaped-debug-html',
	severity: 'High',
	symbol: 'renderDebugHtml',
};

const ADMIN: AuditEvalSite = {
	aliases: ['x-admin', 'authorization bypass'],
	auditId: 'SECURITY',
	file: 'backend/src/server.ts',
	id: 'spoofable-admin-header',
	line: 12,
	severity: 'High',
};

const TRAVERSAL: AuditEvalSite = {
	aliases: ['path traversal', '../'],
	auditId: 'SECURITY',
	file: 'backend/src/storage.ts',
	id: 'upload-path-traversal',
	severity: 'High',
	symbol: 'readUpload',
};

const HEALTH_DECOY: AuditEvalSite = {
	aliases: ['authentication', 'health', 'unauthenticated'],
	auditId: 'SECURITY',
	file: 'backend/src/server.ts',
	id: 'public-health-is-intentional',
	severity: 'Low',
	symbol: 'health',
};

const ASSET_DECOY: AuditEvalSite = {
	aliases: ['traversal', 'url'],
	auditId: 'SECURITY',
	file: 'backend/src/storage.ts',
	id: 'encoded-asset-url-is-safe',
	severity: 'Low',
	symbol: 'publicAssetUrl',
};

function catalog(overrides: Partial<AuditEvalCatalog['scoring']> = {}): AuditEvalCatalog {
	return {
		auditId: 'SECURITY',
		decoys: [HEALTH_DECOY, ASSET_DECOY],
		defects: [HTML, ADMIN, TRAVERSAL],
		scoring: {
			lineTolerance: 3,
			precisionWeight: 0.5,
			recallWeight: 0.5,
			strictPrecision: false,
			...overrides,
		},
	};
}

function finding(
	id: string,
	text: string,
	files = ['backend/src/server.ts'],
	lines: number[] = [],
): ReportedAuditFinding {
	return { files, id, lines, text };
}

describe('findingMatchesSite', () => {
	test('a symbol site needs the whole identifier, not a keyword elsewhere in the file', () => {
		const wrongSymbol = finding(
			'wrong-symbol',
			'publicAssetUrl allows path traversal outside the upload directory.',
			['backend/src/storage.ts'],
		);
		expect(findingMatchesSite(wrongSymbol, TRAVERSAL, 3)).toBe(false);
		expect(findingMatchesSite(wrongSymbol, ASSET_DECOY, 3)).toBe(true);

		const partial = finding('partial', 'The healthy endpoint has no authentication.');
		expect(findingMatchesSite(partial, HEALTH_DECOY, 3)).toBe(false);
	});

	test('a line site accepts a cited line within the tolerance and rejects one outside it', () => {
		const near = finding(
			'near',
			'backend/src/server.ts:14 - the x-admin header allows an authorization bypass.',
			[],
			[14],
		);
		const far = finding(
			'far',
			'backend/src/server.ts:40 - the x-admin header allows an authorization bypass.',
			[],
			[40],
		);
		expect(findingMatchesSite(near, ADMIN, 3)).toBe(true);
		expect(findingMatchesSite(near, ADMIN, 1)).toBe(false);
		expect(findingMatchesSite(far, ADMIN, 3)).toBe(false);
	});

	test('the cataloged file must be named, in affectedFiles or in the text', () => {
		const elsewhere = finding('elsewhere', 'renderDebugHtml emits unescaped HTML (XSS).', [
			'backend/src/other.ts',
		]);
		expect(findingMatchesSite(elsewhere, HTML, 3)).toBe(false);
		const inText = finding(
			'in-text',
			'backend/src/server.ts: renderDebugHtml emits unescaped HTML (XSS).',
			[],
		);
		expect(findingMatchesSite(inText, HTML, 3)).toBe(true);
	});
});

describe('scoreAuditFindings', () => {
	test('a consolidated finding naming two defects credits both', () => {
		const result = scoreAuditFindings(catalog(), [
			finding(
				'combined',
				'renderDebugHtml emits unescaped HTML (XSS); readUpload in backend/src/storage.ts permits path traversal.',
				['backend/src/server.ts', 'backend/src/storage.ts'],
			),
			finding(
				'admin',
				'backend/src/server.ts:12 trusts x-admin (authorization bypass).',
				[],
				[12],
			),
		]);
		expect(result.auditEval?.matchedDefectIds).toEqual([HTML.id, ADMIN.id, TRAVERSAL.id]);
		expect(result.auditEval?.recall).toBe(1);
		expect(result.auditEval?.precision).toBe(1);
		expect(result.auditEval?.creditedFindingIds).toEqual(['combined', 'admin']);
	});

	test('a decoy report that borrows a defect alias is a decoy hit, not a catch', () => {
		const result = scoreAuditFindings(catalog(), [
			finding('html', 'renderDebugHtml emits unescaped HTML (XSS).'),
			finding(
				'wrong-symbol',
				'publicAssetUrl allows path traversal outside the upload directory.',
				['backend/src/storage.ts'],
			),
		]);
		expect(result.auditEval?.matchedDefectIds).toEqual([HTML.id]);
		expect(result.auditEval?.decoyFindingIds).toEqual(['wrong-symbol']);
		expect(result.auditEval?.spuriousFindingIds).toEqual(['wrong-symbol']);
		expect(result.auditEval?.precision).toBe(0.5);
		expect(result.auditEval?.recall).toBeCloseTo(1 / 3);
		expect(result.notes).toContain(
			'decoy finding: wrong-symbol (decoy: encoded-asset-url-is-safe)',
		);
	});

	test('uncataloged findings are noted and count against precision only under strictPrecision', () => {
		const findings = [
			finding('html', 'renderDebugHtml emits unescaped HTML (XSS).'),
			finding('logging', 'Request logging writes the full body to stdout.', [
				'backend/src/log.ts',
			]),
		];
		const lenient = scoreAuditFindings(catalog(), findings);
		expect(lenient.auditEval?.uncatalogedFindingIds).toEqual(['logging']);
		expect(lenient.auditEval?.spuriousFindingIds).toEqual([]);
		expect(lenient.auditEval?.precision).toBe(1);
		expect(lenient.notes).toContain('uncataloged findings: 1');

		const strict = scoreAuditFindings(catalog({ strictPrecision: true }), findings);
		expect(strict.auditEval?.spuriousFindingIds).toEqual(['logging']);
		expect(strict.auditEval?.precision).toBe(0.5);
	});

	test('two decoy hits with every defect found give precision 0.6 and recall 1', () => {
		const result = scoreAuditFindings(catalog(), [
			finding('html', 'renderDebugHtml emits unescaped HTML (XSS).'),
			finding(
				'admin',
				'backend/src/server.ts:12 trusts x-admin (authorization bypass).',
				[],
				[12],
			),
			finding('traversal', 'readUpload permits path traversal.', ['backend/src/storage.ts']),
			finding('health', 'The public health endpoint has no authentication.'),
			finding('asset', 'publicAssetUrl builds a url from user input.', [
				'backend/src/storage.ts',
			]),
		]);
		expect(result.auditEval?.precision).toBe(0.6);
		expect(result.auditEval?.recall).toBe(1);
		expect(result.auditEval?.decoyFindingIds).toEqual(['health', 'asset']);
	});

	test('no findings at all scores zero precision and zero recall', () => {
		const result = scoreAuditFindings(catalog(), []);
		expect(result.auditEval?.precision).toBe(0);
		expect(result.auditEval?.recall).toBe(0);
		expect(result.auditEval?.missedDefectIds).toEqual([HTML.id, ADMIN.id, TRAVERSAL.id]);
	});

	test('the finding id is not part of the haystack', () => {
		// The id carries the symbol and an alias; the text names neither, so nothing is credited.
		const result = scoreAuditFindings(catalog(), [
			finding('renderDebugHtml-xss', 'A template helper needs review.'),
		]);
		expect(result.auditEval?.creditedFindingIds).toEqual([]);
		expect(result.auditEval?.uncatalogedFindingIds).toEqual(['renderDebugHtml-xss']);
	});
});
