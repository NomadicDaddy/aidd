import { describe, expect, test } from 'bun:test';

import { buildPriorityHealth } from '../../backend/src/services/director/priority/priorityHealth.ts';
import type {
	DirectorAuditHealth,
	DirectorBacklogBreakdown,
} from '../../backend/src/services/director/priority/types.ts';
import {
	buildBlockedBacklogHealthWork,
	buildProjectWork,
} from '../../backend/src/services/director/priority/workBuilder.ts';
import type { ProjectSummaryDto } from '../../backend/src/types/project.ts';

// Morticia on 81c6abb: once only runnable buckets became work, a project whose remediation
// records were all blocked scored healthy (100, "No priority issues detected") with findings open.

// A clean artifact check, so the only thing left for health to report is the blocked backlog.
const project = {
	artifactHealth: 'healthy',
	metadata: {
		artifactCheck: { summary: { requiredMissing: 0, stale: 0 } },
		maturity: { currentStageId: 'engaged' },
		profile: { bucket: 'single_user_local' },
	},
	name: 'blocked-app',
	phase: 'coding',
	routeId: 'blocked-app',
} as unknown as ProjectSummaryDto;

const noAuditHealth: DirectorAuditHealth = {
	checkedAt: '2026-01-01T00:00:00.000Z',
	fresh: [],
	missing: [],
	stale: [],
	staleThresholdDays: 30,
};

function backlog(readyCount: number): DirectorBacklogBreakdown {
	return {
		audit: { blockedCount: 0, bySeverity: {}, count: 0, readyCount: 0, top: [] },
		feature: { blockedCount: 0, count: 0, readyCount: 0, top: [] },
		remediation: { blockedCount: 2 - readyCount, count: 2, readyCount, top: [] },
		unfolded: { count: 0, top: [] },
	};
}

describe('director health counts blocked backlog', () => {
	test('an all-blocked remediation bucket keeps health unhealthy without offering a run', () => {
		const work = buildProjectWork(project, backlog(0), noAuditHealth, false);
		const blocked = buildBlockedBacklogHealthWork(project, backlog(0), false);

		expect(work.map((item) => item.taskType)).not.toContain('remediation_backlog');
		expect(blocked).toHaveLength(1);
		expect(blocked[0]?.suggestedRecipe).toBeNull();
		const health = buildPriorityHealth([...work, ...blocked]);
		expect(health.score).toBeLessThan(100);
		expect(health.primaryTaskType).toBe('remediation_backlog');
		expect(health.reasons.join(' ')).toContain('none runnable');
	});

	test('a bucket with a ready record adds no health-only item', () => {
		expect(buildBlockedBacklogHealthWork(project, backlog(1), false)).toEqual([]);
	});
});
