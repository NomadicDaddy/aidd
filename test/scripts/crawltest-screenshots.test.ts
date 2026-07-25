import { describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	getVersionedScreenshotDir,
	screenshotFilename,
} from '../../scripts/crawltest-screenshots.ts';
import { testTempDir } from '../_helpers/temp.ts';

describe('crawltest screenshots', () => {
	test('stores screenshots under the application version', async () => {
		const root = await testTempDir('aidd-crawltest-screenshots-');
		const baseDir = join(root, 'screenshots');
		await writeFile(join(root, 'package.json'), '{"version":"2.132.0"}\n');

		expect(getVersionedScreenshotDir(baseDir, root)).toBe(
			join(root, 'screenshots', 'v2.132.0')
		);
	});

	test('falls back to the screenshot root without a readable version', async () => {
		const root = await testTempDir('aidd-crawltest-screenshots-fallback-');
		const baseDir = join(root, 'screenshots');

		expect(getVersionedScreenshotDir(baseDir, root)).toBe(baseDir);
	});

	test('keeps desktop names simple and mobile screenshots distinct', () => {
		expect(screenshotFilename('/', 'desktop')).toBe('root.png');
		expect(screenshotFilename('/settings?section=runtime', 'desktop')).toBe(
			'settings-section-runtime.png'
		);
		expect(screenshotFilename('/settings?section=runtime', 'iphone-12')).toBe(
			'iphone-12-settings-section-runtime.png'
		);
	});
});
