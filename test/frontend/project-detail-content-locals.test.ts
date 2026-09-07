import { describe, expect, test } from 'bun:test';

import type { ProjectAuditEntry, ProjectReport } from '../../frontend/src/api/types.ts';

import { sortAudits } from '../../frontend/src/pages/projects/detail/auditsTabUtils.ts';
import {
	isCommentLine,
	splitStrings,
} from '../../frontend/src/pages/projects/detail/codeLineTokens.ts';
import { sortReports } from '../../frontend/src/pages/projects/detail/reportsUtils.ts';

function report(id: string, createdAt: string, kind: ProjectReport['kind']): ProjectReport {
	return {
		createdAt,
		description: id,
		id,
		kind,
		reportedBy: { username: 'tester' },
		status: 'open',
	};
}

function audit(
	name: string,
	state: 'fresh' | 'missing' | 'stale',
	score: number,
): ProjectAuditEntry {
	return {
		appliesToBucket: true,
		changePotential: {
			band: 'Medium',
			confidence: 'Medium',
			evidence: {
				actionable: true,
				activeAuditFeatures: 0,
				appsWithAuditReports: 0,
				appsWithCompletedFeatureEvidence: 0,
				completedRunsWithFindings: 0,
				incompleteAuditRuns: 0,
				priority: null,
			},
			score,
		},
		enabled: name !== 'Disabled',
		freshReport: state === 'fresh',
		missingReport: state === 'missing',
		name,
		overrideEffect: null,
		path: `audits/${name}.md`,
		staleReport: state === 'stale',
		updatedAt: null,
	};
}

describe('project-detail local remediation behavior', () => {
	test('keeps Markdown structure and structured-data rows out of comment/string styling', () => {
		expect(isCommentLine('# Heading', 'Markdown')).toBe(false);
		expect(isCommentLine('* List item', 'markdown')).toBe(false);
		expect(isCommentLine('<!-- note -->', 'markdown')).toBe(true);
		expect(splitStrings('"name": "aidd"')).toEqual([{ kind: 'code', text: '"name": "aidd"' }]);
		expect(splitStrings('const name = "aidd";')).toContainEqual({
			kind: 'string',
			text: '"aidd"',
		});
	});

	test('sorts reports by the selected field without mutating the API order', () => {
		const reports = [
			report('old-feature', '2026-08-20T00:00:00.000Z', 'feature'),
			report('new-bug', '2026-08-24T00:00:00.000Z', 'bug'),
		];
		expect(
			sortReports(reports, { direction: 'desc', key: 'filed' }).map(({ id }) => id),
		).toEqual(['new-bug', 'old-feature']);
		expect(sortReports(reports, { direction: 'asc', key: 'kind' }).map(({ id }) => id)).toEqual(
			['new-bug', 'old-feature'],
		);
		expect(reports.map(({ id }) => id)).toEqual(['old-feature', 'new-bug']);
	});

	test('sorts audits deterministically by name, potential, and report health', () => {
		const audits = [
			audit('Zulu', 'fresh', 10),
			audit('Alpha', 'stale', 80),
			audit('Beta', 'missing', 40),
		];
		expect(
			sortAudits(audits, { direction: 'asc', key: 'audit' }).map(({ name }) => name),
		).toEqual(['Alpha', 'Beta', 'Zulu']);
		expect(sortAudits(audits, { direction: 'desc', key: 'potential' })[0]?.name).toBe('Alpha');
		expect(sortAudits(audits, { direction: 'asc', key: 'report' })[0]?.name).toBe('Beta');
	});
});
