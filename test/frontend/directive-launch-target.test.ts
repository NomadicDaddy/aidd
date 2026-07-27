import { describe, expect, test } from 'bun:test';

import { chooseDirectiveProjectPath } from '../../frontend/src/components/shared/directive-launch-target.ts';

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
