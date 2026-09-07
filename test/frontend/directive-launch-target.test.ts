import { describe, expect, test } from 'bun:test';

import {
	advanceDirectiveProjectSeed,
	chooseDirectiveProjectPath,
	createDirectiveProjectSeedState,
} from '../../frontend/src/components/shared/directive-launch-target.ts';

const projects = [
	{
		id: 'aidd-id',
		name: 'aidd',
		path: 'D:\\applications\\aidd',
		routeId: 'aidd',
	},
	{
		id: 'demo-id',
		name: 'demo app',
		path: 'D:\\applications\\demo app',
		routeId: 'demo app',
	},
];

describe('chooseDirectiveProjectPath', () => {
	test('preselects the project identified by the current project-detail route', () => {
		expect(chooseDirectiveProjectPath(projects, '/projects/aidd')).toBe(
			'D:\\applications\\aidd',
		);
		expect(chooseDirectiveProjectPath(projects, '/projects/demo%20app')).toBe(
			'D:\\applications\\demo app',
		);
	});

	test('requires an explicit project outside a matching project-detail route', () => {
		expect(chooseDirectiveProjectPath(projects, '/projects')).toBe('');
		expect(chooseDirectiveProjectPath(projects, '/runs')).toBe('');
		expect(chooseDirectiveProjectPath(projects, '/projects/unknown')).toBe('');
	});
});

describe('directive project seeding lifecycle', () => {
	test('captures the opening route while project data loads and seeds from that route once', () => {
		const opening = advanceDirectiveProjectSeed(createDirectiveProjectSeedState(), {
			open: true,
			pathname: '/projects/aidd',
			projects: undefined,
		});
		expect(opening.projectDir).toBeNull();

		const loadedAfterNavigation = advanceDirectiveProjectSeed(opening.state, {
			open: true,
			pathname: '/projects/demo%20app',
			projects,
		});
		expect(loadedAfterNavigation.projectDir).toBe('D:\\applications\\aidd');
	});

	test('does not replace the visible project after navigation while the launcher stays open', () => {
		const seeded = advanceDirectiveProjectSeed(createDirectiveProjectSeedState(), {
			open: true,
			pathname: '/projects/aidd',
			projects,
		});
		expect(seeded.projectDir).toBe('D:\\applications\\aidd');

		let visibleProjectDir = 'D:\\applications\\demo app';
		const navigated = advanceDirectiveProjectSeed(seeded.state, {
			open: true,
			pathname: '/projects/demo%20app',
			projects,
		});
		if (navigated.projectDir !== null) visibleProjectDir = navigated.projectDir;

		expect(navigated.projectDir).toBeNull();
		expect(visibleProjectDir).toBe('D:\\applications\\demo app');
	});

	test('resets the seed lifecycle when the launcher closes', () => {
		const seeded = advanceDirectiveProjectSeed(createDirectiveProjectSeedState(), {
			open: true,
			pathname: '/projects/aidd',
			projects,
		});
		const closed = advanceDirectiveProjectSeed(seeded.state, {
			open: false,
			pathname: '/projects/demo%20app',
			projects,
		});
		const reopened = advanceDirectiveProjectSeed(closed.state, {
			open: true,
			pathname: '/projects/demo%20app',
			projects,
		});

		expect(reopened.projectDir).toBe('D:\\applications\\demo app');
	});
});
