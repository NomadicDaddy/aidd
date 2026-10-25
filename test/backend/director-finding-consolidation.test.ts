import { describe, expect, test } from 'bun:test';

import type { Feature } from 'aidd-shared/metadata/features';

import { summarizeBacklog } from '../../backend/src/services/director/priority/backlogSummary.ts';
import { buildPriorityHealth } from '../../backend/src/services/director/priority/priorityHealth.ts';
import type { DirectorAuditHealth } from '../../backend/src/services/director/priority/types.ts';
import { buildProjectWork } from '../../backend/src/services/director/priority/workBuilder.ts';
import type { ProjectSummaryDto } from '../../backend/src/types/project.ts';

// Phillip #22869/#22872: nothing in aidd started a consolidation, so completed findings stood as
// records nobody would pick up (184 across 15 repositories on 2026-10-25). The Director now
// offers one item per project that has any.

const project = {
	artifactHealth: 'healthy',
	metadata: {
		artifactCheck: { summary: { requiredMissing: 0, stale: 0 } },
		maturity: { currentStageId: 'engaged' },
		profile: { bucket: 'single_user_local' },
	},
	name: 'folding-app',
	phase: 'coding',
	routeId: 'folding-app',
} as unknown as ProjectSummaryDto;

const noAuditHealth: DirectorAuditHealth = {
	checkedAt: '2026-01-01T00:00:00.000Z',
	fresh: [],
	missing: [],
	stale: [],
	staleThresholdDays: 30,
};

function record(id: string, fields: Partial<Feature> = {}): Feature {
	return {
		id,
		passes: true,
		priority: 3,
		status: 'completed',
		title: id,
		...fields,
	} as Feature;
}

describe('completed findings waiting to be folded', () => {
	test('counts completed audit and remediation findings, and nothing else', () => {
		const backlog = summarizeBacklog(
			[
				record('audit-security-1790000000-token-in-log', { auditSource: 'SECURITY' }),
				record('remediation-20261025-broken-link'),
				// A product feature whose name happens to start with audit- is not a finding.
				record('audit-manager'),
				// Open findings belong to the audit and remediation backlogs.
				record('remediation-20261025-open', { passes: false, status: 'backlog' }),
				record('dashboard-cards'),
			],
			false,
		);

		expect(backlog.unfolded.count).toBe(2);
		expect(backlog.unfolded.top.map((item) => item.id).sort()).toEqual([
			'audit-security-1790000000-token-in-log',
			'remediation-20261025-broken-link',
		]);
	});

	test('a derived app does not count template-owned records; the template repo does', () => {
		const templateRecord = record('remediation-20261001-template-shell', {
			spernakit_version: '3.47.5',
		});

		expect(summarizeBacklog([templateRecord], false).unfolded.count).toBe(0);
		expect(summarizeBacklog([templateRecord], true).unfolded.count).toBe(1);
	});

	test('the Director offers the consolidation recipe when any are standing', () => {
		const backlog = summarizeBacklog([record('remediation-20261025-broken-link')], false);
		const work = buildProjectWork(project, backlog, noAuditHealth, false);
		const item = work.find((entry) => entry.taskType === 'finding_consolidation');

		expect(item).toBeDefined();
		expect(item?.suggestedRecipe).toBe('feature-consolidation-document-changes');
		expect(item?.suggestedArgs).toBeNull();
		expect(item?.riskLevel).toBe('LOW');
		expect(buildPriorityHealth(work).primaryTaskType).toBe('finding_consolidation');
	});

	test('the Director offers nothing when no completed finding is standing', () => {
		const backlog = summarizeBacklog([record('dashboard-cards')], false);
		const work = buildProjectWork(project, backlog, noAuditHealth, false);

		expect(work.map((entry) => entry.taskType)).not.toContain('finding_consolidation');
	});
});
