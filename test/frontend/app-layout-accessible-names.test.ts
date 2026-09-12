import { describe, expect, test } from 'bun:test';

import {
	activeExecutionCountAccessibleName,
	projectCountAccessibleName,
	searchControlAccessibleName,
} from '../../frontend/src/components/layout/appLayoutAccessibility.ts';

describe('AppLayout shell control accessible names', () => {
	test('lets visible search content name the expanded control', () => {
		expect(searchControlAccessibleName(false)).toBeUndefined();
		expect(searchControlAccessibleName(true)).toBe('Open command palette');
	});

	test('names a rendered count badge and omits a zero-count label', () => {
		expect(activeExecutionCountAccessibleName(3)).toBe('3 active executions');
		expect(activeExecutionCountAccessibleName(1)).toBe('1 active execution');
		expect(activeExecutionCountAccessibleName(0)).toBeUndefined();
	});

	test('names the projects count and stays quiet while it is still loading', () => {
		expect(projectCountAccessibleName(39)).toBe('39 discovered projects');
		expect(projectCountAccessibleName(1)).toBe('1 discovered project');
		// Neither state renders a badge, so neither has anything to announce.
		expect(projectCountAccessibleName(0)).toBeUndefined();
		expect(projectCountAccessibleName(null)).toBeUndefined();
	});
});
