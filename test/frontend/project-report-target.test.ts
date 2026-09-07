import { describe, expect, test } from 'bun:test';

import { chooseReportProjectId } from '../../frontend/src/components/layout/project-report-target.ts';

const projects = [
	{
		artifactHealth: 'fresh' as const,
		featureStats: {
			closed: 0,
			failing: 0,
			open: 0,
			passing: 0,
			total: 0,
			waitingApproval: 0,
		},
		id: 'valley-app',
		metadata: null as never,
		name: 'valley-app',
		path: 'D:\\applications\\valley-app',
		phase: 'coding' as const,
		priorityHealth: null as never,
	},
	{
		artifactHealth: 'fresh' as const,
		featureStats: {
			closed: 0,
			failing: 0,
			open: 0,
			passing: 0,
			total: 0,
			waitingApproval: 0,
		},
		id: 'aidd',
		metadata: null as never,
		name: 'aidd',
		path: 'D:\\applications\\aidd',
		phase: 'coding' as const,
		priorityHealth: null as never,
	},
];

describe('chooseReportProjectId', () => {
	test('defaults global reports to aidd instead of the first discovered project', () => {
		expect(chooseReportProjectId(projects)).toBe('aidd');
	});

	test('requires an explicit selection when aidd is not discovered', () => {
		expect(chooseReportProjectId([projects[0]!])).toBe('');
	});
});
