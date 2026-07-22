import { describe, expect, test } from 'bun:test';

import { defaultBugProjectId } from '../../scripts/crawltest.ts';

describe('crawltest report target', () => {
	test('defaults bug submissions to aidd instead of the first discovered project', () => {
		expect(
			defaultBugProjectId([
				{ id: 'valley-app', name: 'valley-app', path: 'D:\\applications\\valley-app' },
				{ id: 'aidd', name: 'AI Development Director', path: 'D:\\applications\\aidd' },
			])
		).toBe('aidd');
	});

	test('fails closed when aidd is unavailable and no project was specified', () => {
		expect(() =>
			defaultBugProjectId([
				{ id: 'valley-app', name: 'valley-app', path: 'D:\\applications\\valley-app' },
			])
		).toThrow('aidd project is not available for --bug');
	});
});
