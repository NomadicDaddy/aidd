import { describe, expect, test } from 'bun:test';
import { backendNames } from 'aidd-shared/plan/types';

import {
	backendLabel,
	backendOptions,
	providerLabel,
	providerOptions,
} from '../../frontend/src/lib/backends.ts';

describe('frontend backend options', () => {
	test('exposes every canonical backend including Cline', () => {
		expect(backendOptions.map(({ value }) => value)).toEqual([...backendNames]);
		expect(backendOptions).toContainEqual({ label: 'Cline', value: 'cline' });
		expect(backendLabel('cline')).toBe('Cline');
	});

	test('exposes canonical provider labels without changing wire values', () => {
		expect(providerLabel('lmstudio')).toBe('LM Studio');
		expect(providerLabel('xai')).toBe('xAI');
		expect(providerLabel('custom-provider')).toBe('custom-provider');
		expect(providerOptions(['lmstudio', 'zhipu'])).toEqual([
			{ label: 'LM Studio', value: 'lmstudio' },
			{ label: 'Zhipu', value: 'zhipu' },
		]);
	});
});
