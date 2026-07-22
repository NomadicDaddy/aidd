import { describe, expect, test } from 'bun:test';

import {
	PROJECT_DETAIL_TAB_IDS,
	projectDetailTabSearchParams,
	readProjectDetailTab,
} from '../../frontend/src/pages/projects/detail/projectDetailNavigation.ts';

describe('project detail navigation', () => {
	test('accepts every bookmarkable project tab', () => {
		for (const tab of PROJECT_DETAIL_TAB_IDS) {
			expect(readProjectDetailTab(tab)).toBe(tab);
		}
	});

	test('falls back to overview for missing and unknown tab values', () => {
		expect(readProjectDetailTab(null)).toBe('overview');
		expect(readProjectDetailTab('unknown')).toBe('overview');
	});

	test('preserves nested tab filters while changing project tabs', () => {
		const current = new URLSearchParams('tab=features&featureStatus=completed&featurePage=2');
		const next = projectDetailTabSearchParams(current, 'runs');

		expect(next.get('tab')).toBe('runs');
		expect(next.get('featureStatus')).toBe('completed');
		expect(next.get('featurePage')).toBe('2');
		expect(current.get('tab')).toBe('features');
	});

	test('uses the clean project URL for the default overview tab', () => {
		const next = projectDetailTabSearchParams(
			new URLSearchParams('tab=runs&featureStatus=completed'),
			'overview'
		);

		expect(next.has('tab')).toBe(false);
		expect(next.get('featureStatus')).toBe('completed');
	});
});
