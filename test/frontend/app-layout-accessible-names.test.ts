import { describe, expect, test } from 'bun:test';

import { searchControlAccessibleName } from '../../frontend/src/components/layout/appLayoutAccessibility.ts';

describe('AppLayout shell control accessible names', () => {
	test('lets visible search content name the expanded control', () => {
		expect(searchControlAccessibleName(false)).toBeUndefined();
		expect(searchControlAccessibleName(true)).toBe('Open command palette');
	});
});
