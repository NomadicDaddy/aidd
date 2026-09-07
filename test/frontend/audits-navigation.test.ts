import { describe, expect, test } from 'bun:test';

import {
	auditsTabSearchParams,
	readAuditsTab,
} from '../../frontend/src/pages/audits/auditsNavigation.ts';

describe('audits navigation', () => {
	test('accepts every bookmarkable audits tab', () => {
		for (const tab of ['catalog', 'applicability', 'overrides'] as const) {
			expect(readAuditsTab(tab)).toBe(tab);
		}
	});

	test('falls back to the catalog for missing and unknown tab values', () => {
		expect(readAuditsTab(null)).toBe('catalog');
		expect(readAuditsTab('unknown')).toBe('catalog');
	});

	test('preserves unrelated query parameters while changing tabs', () => {
		const current = new URLSearchParams('tab=catalog&source=project');
		const next = auditsTabSearchParams(current, 'overrides');

		expect(next.get('tab')).toBe('overrides');
		expect(next.get('source')).toBe('project');
		expect(current.get('tab')).toBe('catalog');
	});

	test('uses the clean audits URL for the default catalog tab', () => {
		const next = auditsTabSearchParams(
			new URLSearchParams('tab=applicability&source=project'),
			'catalog',
		);

		expect(next.has('tab')).toBe(false);
		expect(next.get('source')).toBe('project');
	});
});
