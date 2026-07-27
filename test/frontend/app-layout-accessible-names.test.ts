import { describe, expect, test } from 'bun:test';

import {
	activeExecutionCountAccessibleName,
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
});
