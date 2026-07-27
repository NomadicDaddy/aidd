import { describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	CRAWL_RESULT_FILE,
	getVersionedScreenshotDir,
	screenshotFilename,
	writeCrawlResult,
} from '../../scripts/crawltest-screenshots.ts';
import { isIgnorableRequestFailure } from '../../scripts/lib/crawltest/page-assertions.ts';
import { testTempDir } from '../_helpers/temp.ts';

describe('crawltest screenshots', () => {
	test('stores screenshots under the application version', async () => {
		const root = await testTempDir('aidd-crawltest-screenshots-');
		const baseDir = join(root, 'screenshots');
		await writeFile(join(root, 'package.json'), '{"version":"2.132.0"}\n');

		expect(getVersionedScreenshotDir(baseDir, root)).toBe(
			join(root, 'screenshots', 'v2.132.0'),
		);
	});

	test('falls back to the screenshot root without a readable version', async () => {
		const root = await testTempDir('aidd-crawltest-screenshots-fallback-');
		const baseDir = join(root, 'screenshots');

		expect(getVersionedScreenshotDir(baseDir, root)).toBe(baseDir);
	});

	test('stamps the crawl verdict where the pre-push guard reads it', async () => {
		const root = await testTempDir('aidd-crawltest-result-');
		const directory = join(root, 'screenshots', 'v9.9.9');

		await writeCrawlResult(directory, { status: 'started', success: false });
		const started = await Bun.file(join(directory, CRAWL_RESULT_FILE)).text();
		expect(started).toContain('"success": false');

		await writeCrawlResult(directory, { screenshots: 40, status: 'passed', success: true });
		const passed = await Bun.file(join(directory, CRAWL_RESULT_FILE)).text();
		// The guard greps this exact shape; JSON.stringify's tab indent must keep it on one line.
		expect(passed).toContain('"success": true');
		expect(JSON.parse(passed)).toMatchObject({ screenshots: 40, status: 'passed' });
	});

	test('a request the page cancelled is not a network error', () => {
		expect(isIgnorableRequestFailure('net::ERR_ABORTED')).toBe(true);
		expect(isIgnorableRequestFailure('net::ERR_BLOCKED_BY_CLIENT')).toBe(true);
		expect(isIgnorableRequestFailure('net::ERR_CONNECTION_REFUSED')).toBe(false);
		expect(isIgnorableRequestFailure('net::ERR_NAME_NOT_RESOLVED')).toBe(false);
		expect(isIgnorableRequestFailure('request failed')).toBe(false);
	});

	test('keeps desktop names simple and mobile screenshots distinct', () => {
		expect(screenshotFilename('/', 'desktop')).toBe('root.png');
		expect(screenshotFilename('/settings?section=runtime', 'desktop')).toBe(
			'settings-section-runtime.png',
		);
		expect(screenshotFilename('/settings?section=runtime', 'iphone-12')).toBe(
			'iphone-12-settings-section-runtime.png',
		);
	});
});
