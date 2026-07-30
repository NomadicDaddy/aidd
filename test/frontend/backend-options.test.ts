import { describe, expect, test } from 'bun:test';
import { backendNames } from 'aidd-shared/plan/types';

import { backendLabel, backendOptions } from '../../frontend/src/lib/backends.ts';

describe('frontend backend options', () => {
	test('exposes every canonical backend including Cline', () => {
		expect(backendOptions.map(({ value }) => value)).toEqual([...backendNames]);
		expect(backendOptions).toContainEqual({ label: 'Cline', value: 'cline' });
		expect(backendLabel('cline')).toBe('Cline');
	});
});
