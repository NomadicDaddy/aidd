import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { crawlEvidencePaths } from '../../scripts/crawltest-reporting.ts';

describe('crawl evidence paths', () => {
	// The desktop crawl is what the release capture, the analyzer's default and the audits read, so
	// its names never change; a phone crawl run after it (CI runs both) must not overwrite it.
	test('the desktop crawl keeps the bare evidence names', () => {
		const paths = crawlEvidencePaths('root', 'desktop');
		expect(paths.jsonPath).toBe(join('root', 'logs', 'crawltest.json'));
		expect(paths.summaryPath).toBe(join('root', 'logs', 'crawltest-summary.md'));
		expect(paths.screenshotsDir).toBe(join('root', 'logs', 'crawltest-screenshots'));
	});

	test('any other viewport carries its name in every evidence path', () => {
		const paths = crawlEvidencePaths('root', 'iphone-12');
		expect(paths.jsonPath).toBe(join('root', 'logs', 'crawltest-iphone-12.json'));
		expect(paths.summaryPath).toBe(join('root', 'logs', 'crawltest-iphone-12-summary.md'));
		expect(paths.screenshotsDir).toBe(join('root', 'logs', 'crawltest-screenshots-iphone-12'));
		const desktop = crawlEvidencePaths('root', 'desktop');
		for (const key of ['jsonPath', 'summaryPath', 'screenshotsDir'] as const) {
			expect(paths[key]).not.toBe(desktop[key]);
		}
	});
});
