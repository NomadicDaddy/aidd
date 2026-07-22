import { describe, expect, test } from 'bun:test';
import { dedupDirectorSuggestions, type DirectorSuggestion } from 'aidd-shared';

import { expandTargetedWork } from '../../backend/src/services/director/priority/workBuilder.ts';
import { summarizeBacklog } from '../../backend/src/services/director/priority/backlogSummary.ts';
import type {
	DirectorBacklogItemSummary,
	DirectorPrioritizedWork,
} from '../../backend/src/services/director/priority/types.ts';

// A representative aggregate audit-backlog work item, shaped exactly like buildProjectWork
// emits one: a wildcard filter over the whole backlog, with the concrete artifacts carried
// in evidence.top (capped at 5 by backlogSummary).
function auditAggregate(count: number, top: DirectorBacklogItemSummary[]): DirectorPrioritizedWork {
	return {
		evidence: {
			auditBacklogCount: count,
			bySeverity: { critical: 1, high: 2, medium: count - 3 },
			count,
			sourcePriority: 1,
			top,
		},
		projectId: 'aidd-web',
		rank: 1,
		reason: `aidd-web has ${count} audit backlog item(s).`,
		riskLevel: 'HIGH',
		suggestedArgs: { filterBy: 'id', filterValue: 'audit-*' },
		suggestedRecipe: 'remediate-audit-findings',
		taskType: 'audit_backlog',
		title: 'aidd-web: resolve audit backlog',
	};
}

const fiveFindings: DirectorBacklogItemSummary[] = [
	{ auditSeverity: 'critical', id: 'audit-1', priority: 1, title: 'SQL injection in login' },
	{ auditSeverity: 'high', id: 'audit-2', priority: 2, title: 'Reflected XSS' },
	{ auditSeverity: 'high', id: 'audit-3', priority: 3, title: 'Missing CSRF token' },
	{ auditSeverity: 'medium', id: 'audit-4', priority: 4, title: 'Weak password hash' },
	{ auditSeverity: 'medium', id: 'audit-5', priority: 5, title: 'Verbose error pages' },
];

describe('expandTargetedWork', () => {
	test('expands an audit backlog into per-finding suggestions plus a rollup', () => {
		const work = expandTargetedWork([auditAggregate(12, fiveFindings)], {
			granularity: 'targeted',
			maxPerBucket: 3,
		});
		// 3 targeted findings + 1 rollup
		expect(work).toHaveLength(4);

		const targeted = work.filter((item) => item.suggestedArgs?.filterValue !== 'audit-*');
		expect(targeted.map((item) => item.suggestedArgs?.filterValue)).toEqual([
			'audit-1',
			'audit-2',
			'audit-3',
		]);
		// Each targeted item names the artifact and points at its specific id, not a wildcard.
		expect(targeted[0]?.title).toBe('aidd-web: remediate "SQL injection in login" (audit-1)');
		expect(targeted[0]?.suggestedRecipe).toBe('remediate-audit-findings');
		// Targeted items inherit the bucket's policy-derived risk (which already encodes profile
		// escalation / downgrade / maturity deferral), not the raw artifact severity.
		expect(targeted[0]?.riskLevel).toBe('HIGH');
		expect(targeted[2]?.riskLevel).toBe('HIGH');
		// The base reason (with any profile/maturity explanation) is preserved on each item.
		expect(targeted[0]?.reason).toContain('aidd-web has 12 audit backlog item(s).');
		const rollup = work.find((item) => item.suggestedArgs?.filterValue === 'audit-*');
		expect(rollup?.title).toBe('aidd-web: + 9 more audit findings');
		expect(rollup?.evidence.rolledUp).toBe(9);
	});

	test('no rollup when the bucket fits within maxPerBucket', () => {
		const top = fiveFindings.slice(0, 2);
		const work = expandTargetedWork([auditAggregate(2, top)], {
			granularity: 'targeted',
			maxPerBucket: 3,
		});
		expect(work).toHaveLength(2);
		expect(work.every((item) => item.suggestedArgs?.filterValue !== 'audit-*')).toBe(true);
	});

	test('aggregate granularity passes work through unchanged', () => {
		const aggregate = [auditAggregate(12, fiveFindings)];
		const work = expandTargetedWork(aggregate, { granularity: 'aggregate', maxPerBucket: 3 });
		expect(work).toEqual(aggregate);
		expect(work[0]?.suggestedArgs?.filterValue).toBe('audit-*');
	});

	test('feature backlog targets the feature id via the feature arg', () => {
		const featureAggregate: DirectorPrioritizedWork = {
			evidence: {
				count: 4,
				featureBacklogCount: 4,
				sourcePriority: 1,
				top: [{ id: 'feat-export', priority: 1, title: 'Export to CSV' }],
			},
			projectId: 'aidd-web',
			rank: 1,
			reason: 'aidd-web has 4 regular backlog feature(s).',
			riskLevel: 'MEDIUM',
			suggestedArgs: null,
			suggestedRecipe: 'coding',
			taskType: 'feature_completion',
			title: 'aidd-web: continue feature backlog',
		};
		const work = expandTargetedWork([featureAggregate], {
			granularity: 'targeted',
			maxPerBucket: 3,
		});
		const targeted = work.find((item) => item.suggestedArgs?.feature !== undefined);
		expect(targeted?.suggestedArgs).toEqual({ feature: 'feat-export' });
		expect(targeted?.title).toBe('aidd-web: complete feature "Export to CSV" (feat-export)');
	});
});

describe('summarizeBacklog dependency readiness', () => {
	test('ranks only dependency-ready features as actionable next work', () => {
		const backlog = summarizeBacklog([
			{
				dependencies: ['archive-cli-command-suite'],
				id: 'archive-verification',
				passes: false,
				priority: 1,
				status: 'backlog',
				title: 'Read-only Archive Verification',
			},
			{
				id: 'archive-cli-command-suite',
				passes: false,
				priority: 2,
				status: 'backlog',
				title: 'Archive CLI Command Suite',
			},
		]);

		expect(backlog.feature).toMatchObject({ blockedCount: 1, count: 2, readyCount: 1 });
		expect(backlog.feature.top.map((feature) => feature.id)).toEqual([
			'archive-cli-command-suite',
		]);
	});
});

describe('dedupDirectorSuggestions', () => {
	function suggestion(filterValue: string): DirectorSuggestion {
		return {
			description: 'd',
			evidence: {},
			projectId: 'aidd-web',
			reasoning: 'r',
			riskLevel: 'HIGH',
			suggestedArgs: { filterBy: 'id', filterValue },
			taskType: 'audit_backlog',
			title: `fix ${filterValue}`,
		};
	}

	test('keeps distinct artifacts in the same (project, taskType) bucket', () => {
		const out = dedupDirectorSuggestions([
			suggestion('audit-1'),
			suggestion('audit-2'),
			suggestion('audit-1'), // exact duplicate of the first
		]);
		expect(out).toHaveLength(2);
		expect(out.map((item) => item.suggestedArgs?.filterValue)).toEqual(['audit-1', 'audit-2']);
	});
});
