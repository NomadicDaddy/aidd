import { describe, expect, test } from 'bun:test';

import { parseCrawlArgs } from '../../scripts/crawltest-config.ts';
import { resolveSmokeWebArgs } from '../../scripts/smoke-web.ts';

describe('smoke web command forwarding', () => {
	test('uses the requested origin for both readiness and the release crawl', async () => {
		const command = await resolveSmokeWebArgs([
			'--screenshot-pages',
			'--viewport',
			'desktop',
			'--base-url=http://127.0.0.1:4321',
		]);
		const args = parseCrawlArgs(command.crawlArgs.slice(1));
		expect(command.baseUrl).toBe('http://127.0.0.1:4321');
		expect(args.baseUrl).toBe(command.baseUrl);
		expect(args.check404).toBe(true);
		expect(args.screenshotPages).toBe(true);
		expect(args.viewport).toBe('desktop');
		expect(args.page).toBeNull();
		expect(args.startFrom).toBeNull();
	});

	test('preserves diagnostic scope and every supported optional crawler option', async () => {
		const command = await resolveSmokeWebArgs([
			'--base-url',
			'http://127.0.0.1:4321',
			'--page',
			'/settings',
			'--start-from',
			'/projects',
			'--viewport',
			'iphone-12',
			'--bug',
			'--bug-project',
			'fixture',
			'--local-network',
			'--local-network-host',
			'192.168.1.44',
			'--404',
		]);
		expect(parseCrawlArgs(command.crawlArgs.slice(1))).toMatchObject({
			bug: true,
			bugProject: 'fixture',
			check404: true,
			localNetwork: true,
			localNetworkHost: '192.168.1.44',
			page: '/settings',
			screenshotPages: false,
			startFrom: '/projects',
			viewport: 'iphone-12',
		});
	});

	test('rejects unsupported dimensions, unknown presets, and missing values', async () => {
		for (const args of [['--width', '2250'], ['--viewport', '2250x1309'], ['--page']]) {
			await expect(resolveSmokeWebArgs(args)).rejects.toThrow();
		}
	});
});
