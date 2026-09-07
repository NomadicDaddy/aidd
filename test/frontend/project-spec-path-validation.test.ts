import { describe, expect, test } from 'bun:test';

import { isAllowedSpecPath } from '../../frontend/src/pages/projects/projectNewPanelUtils.ts';

describe('project spec path validation', () => {
	test('accepts only absolute paths contained by a configured Windows root', () => {
		const roots = ['D:\\applications', 'C:\\work\\apps'];

		expect(isAllowedSpecPath(roots, 'D:\\applications\\aidd\\spec.md')).toBe(true);
		expect(isAllowedSpecPath(roots, 'd:/APPLICATIONS/aidd/../spec.md')).toBe(true);
		expect(isAllowedSpecPath(roots, 'D:\\applications-other\\spec.md')).toBe(false);
		expect(isAllowedSpecPath(roots, 'D:\\applications\\..\\outside\\spec.md')).toBe(false);
		expect(isAllowedSpecPath(roots, 'spec.md')).toBe(false);
	});

	test('preserves POSIX case and root boundaries', () => {
		expect(isAllowedSpecPath(['/srv/apps'], '/srv/apps/aidd/spec.md')).toBe(true);
		expect(isAllowedSpecPath(['/srv/apps'], '/srv/Apps/aidd/spec.md')).toBe(false);
		expect(isAllowedSpecPath(['/srv/apps'], '/srv/apps-old/spec.md')).toBe(false);
		expect(isAllowedSpecPath(['/'], '/srv/apps/aidd/spec.md')).toBe(true);
	});

	test('rejects an absolute path when no application root can contain it', () => {
		expect(isAllowedSpecPath([], 'D:\\applications\\aidd\\spec.md')).toBe(false);
		expect(isAllowedSpecPath(['/srv/apps'], 'D:\\applications\\aidd\\spec.md')).toBe(false);
	});
});
