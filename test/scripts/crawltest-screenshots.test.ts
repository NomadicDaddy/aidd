import { describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	getVersionedScreenshotDir,
	screenshotFilename,
} from '../../scripts/crawltest-screenshots.ts';
import { isIgnorableRequestFailure } from '../../scripts/lib/crawltest/page-assertions.ts';
import { DEFAULT_ROUTES } from '../../scripts/crawltest-data.ts';
import { testTempDir } from '../_helpers/temp.ts';

describe('crawltest screenshots', () => {
	test('the release contract covers every default route and representative detail route', async () => {
		const contract = (await Bun.file(
			new URL('../../.screenshot-capture', import.meta.url),
		).json()) as { routes: string[] };
		for (const route of [
			...DEFAULT_ROUTES,
			'/projects/example',
			'/recipes/example',
			'/pipeline-sessions/example',
		]) {
			expect(
				contract.routes.some((pattern) => new RegExp(`^(?:${pattern})$`).test(route)),
			).toBe(true);
		}
	});
	test('stores screenshots under the application version', async () => {
		const root = await testTempDir('aidd-crawltest-screenshots-');
		const baseDir = join(root, 'screenshots');
		await writeFile(join(root, 'package.json'), '{"version":"3.0.0"}\n');

		expect(getVersionedScreenshotDir(baseDir, root)).toBe(join(root, 'screenshots', 'v3.0.0'));
	});

	test('falls back to the screenshot root without a readable version', async () => {
		const root = await testTempDir('aidd-crawltest-screenshots-fallback-');
		const baseDir = join(root, 'screenshots');

		expect(getVersionedScreenshotDir(baseDir, root)).toBe(baseDir);
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
