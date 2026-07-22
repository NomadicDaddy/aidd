import { describe, expect, test } from 'bun:test';

import { projectDetailTabSearch } from '../../frontend/src/pages/projects/detail/overviewLinks.ts';

describe('project detail overview links', () => {
	test('builds tab-only links for overview card values', () => {
		expect(projectDetailTabSearch('artifacts')).toBe('?tab=artifacts');
		expect(projectDetailTabSearch('interview')).toBe('?tab=interview');
	});

	test('builds feature milestone links for roadmap entries', () => {
		expect(projectDetailTabSearch('features', { featureMilestone: 'v2.0' })).toBe(
			'?tab=features&featureMilestone=v2.0'
		);
	});
});
