import { describe, expect, test } from 'bun:test';
import type { ProjectFeature, ProjectRoadmapSummary } from '../../frontend/src/api/types.ts';
import {
	featureMatchesFilters,
	UNASSIGNED_MILESTONE,
	unmappedRoadmapCallout,
	withUnassignedMilestoneFilter,
} from '../../frontend/src/pages/projects/detail/featuresUtils.ts';

function roadmap(overrides: Partial<ProjectRoadmapSummary> = {}): ProjectRoadmapSummary {
	return {
		currentMilestone: 'MVP',
		invalidMappings: [],
		milestoneOrder: ['MVP'],
		milestones: {},
		unmappedFeatureDirectories: [],
		...overrides,
	};
}

function feature(milestone?: string): ProjectFeature {
	return { id: milestone ?? 'unassigned', milestone, status: 'backlog' };
}

describe('unmappedRoadmapCallout', () => {
	test('null without a roadmap or without gate problems', () => {
		expect(unmappedRoadmapCallout(null)).toBeNull();
		expect(unmappedRoadmapCallout(roadmap())).toBeNull();
	});

	test('carries unmapped directory names so the operator can fix roadmap.json', () => {
		const gate = unmappedRoadmapCallout(
			roadmap({ unmappedFeatureDirectories: ['github-pages-site', 'feature-x'] }),
		);
		expect(gate?.names).toEqual(['github-pages-site', 'feature-x']);
		expect(gate?.invalid).toEqual([]);
	});

	test('carries invalid milestone references', () => {
		const gate = unmappedRoadmapCallout(
			roadmap({ invalidMappings: [{ featureDirectory: 'feat-a', milestone: 'ghost' }] }),
		);
		expect(gate?.invalid).toEqual([{ featureDirectory: 'feat-a', milestone: 'ghost' }]);
		expect(gate?.names).toEqual([]);
	});
});

describe('unassigned feature filter', () => {
	test('writes the canonical milestone parameter without dropping feature filters', () => {
		const next = withUnassignedMilestoneFilter(
			new URLSearchParams(
				'tab=features&featureQ=roadmap&featureStatus=backlog&featureSource=Remediation',
			),
		);

		expect(next.get('tab')).toBe('features');
		expect(next.get('featureQ')).toBe('roadmap');
		expect(next.get('featureStatus')).toBe('backlog');
		expect(next.get('featureSource')).toBe('Remediation');
		expect(next.get('featureMilestone')).toBe(UNASSIGNED_MILESTONE);
		expect(next.has('milestone')).toBeFalse();
	});

	test('matches only features without a roadmap milestone', () => {
		const filters = {
			milestoneFilter: UNASSIGNED_MILESTONE,
			query: '',
			sourceFilter: 'all',
			statusFilter: 'all',
		};

		expect(featureMatchesFilters(feature(), filters)).toBeTrue();
		expect(featureMatchesFilters(feature('v2.0'), filters)).toBeFalse();
	});
});
