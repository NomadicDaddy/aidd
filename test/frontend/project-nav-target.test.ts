import { describe, expect, test } from 'bun:test';

import { projectDetailTarget } from '../../frontend/src/components/layout/project-nav-target.ts';

describe('projectDetailTarget', () => {
	test('builds an encoded project detail route without a selected tab', () => {
		expect(projectDetailTarget('project/id', '')).toBe('/projects/project%2Fid');
	});

	test('preserves the selected project tab', () => {
		expect(projectDetailTarget('next-project', '?tab=features')).toBe(
			'/projects/next-project?tab=features',
		);
	});

	test('drops project-specific parameters while preserving the tab', () => {
		expect(projectDetailTarget('next-project', '?tab=code&file=frontend%2Fsrc%2FApp.tsx')).toBe(
			'/projects/next-project?tab=code',
		);
	});

	test('does not carry an empty tab value', () => {
		expect(projectDetailTarget('next-project', '?tab=&featureStatus=backlog')).toBe(
			'/projects/next-project',
		);
	});
});
