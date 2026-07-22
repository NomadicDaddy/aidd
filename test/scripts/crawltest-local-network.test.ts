import { describe, expect, test } from 'bun:test';

import {
	assertLocalNetworkAccess,
	isIgnorableConsoleError,
	parseCrawlArgs,
	selectLocalNetworkHost,
	type LocalNetworkInterfaceAddress,
	type LocalNetworkProbeDependencies,
} from '../../scripts/crawltest.ts';

interface FetchRecord {
	origin: string | null;
	url: string;
}

interface ProbeSettings {
	allowRemote: boolean;
	hostname: string;
	port: number;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		headers: { 'content-type': 'application/json' },
		status,
	});
}

function createDependencies(
	settings: ProbeSettings,
	interfaceAddresses: LocalNetworkInterfaceAddress[] = []
): LocalNetworkProbeDependencies & { records: FetchRecord[] } {
	const records: FetchRecord[] = [];
	return {
		records,
		fetch: async (input, init) => {
			const url = new URL(String(input));
			const origin = init?.headers ? new Headers(init.headers).get('origin') : null;
			records.push({ origin, url: url.toString() });
			if (origin === 'http://crawltest.invalid') {
				return jsonResponse({ error: 'Origin not allowed' }, 403);
			}
			if (url.pathname === '/api/v1/health') {
				return jsonResponse({ ok: true });
			}
			return jsonResponse({ config: settings });
		},
		interfaceAddresses: () => interfaceAddresses,
	};
}

describe('crawltest local network probe', () => {
	test('parses local-network flag', () => {
		const args = parseCrawlArgs(['--local-network']);

		expect(args.localNetwork).toBe(true);
		expect(args.localNetworkHost).toBeNull();
	});

	test('parses explicit local-network host', () => {
		const args = parseCrawlArgs(['--local-network', '--local-network-host', '192.168.1.44']);

		expect(args.localNetwork).toBe(true);
		expect(args.localNetworkHost).toBe('192.168.1.44');
	});

	test('rejects disabled remote access', async () => {
		const dependencies = createDependencies({
			allowRemote: false,
			hostname: '0.0.0.0',
			port: 3210,
		});

		const errors = await assertLocalNetworkAccess(
			{ baseUrl: 'http://127.0.0.1:3210', localNetworkHost: null },
			dependencies
		);

		expect(errors).toContain(
			'[local-network] web.allowRemote is false; enable local network access first'
		);
	});

	test('rejects loopback-only hostname', async () => {
		const dependencies = createDependencies({
			allowRemote: true,
			hostname: '127.0.0.1',
			port: 3210,
		});

		const errors = await assertLocalNetworkAccess(
			{ baseUrl: 'http://127.0.0.1:3210', localNetworkHost: null },
			dependencies
		);

		expect(errors[0]).toContain('loopback-only');
	});

	test('selects a non-internal interface for wildcard listeners', () => {
		const selected = selectLocalNetworkHost('0.0.0.0', null, [
			{ address: '127.0.0.1', family: 'IPv4', internal: true },
			{ address: 'fe80::1234', family: 'IPv6', internal: false },
			{ address: '192.168.1.44', family: 'IPv4', internal: false },
		]);

		expect(selected).toBe('192.168.1.44');
	});

	test('uses explicit local-network host before interface selection', () => {
		const selected = selectLocalNetworkHost('0.0.0.0', '10.0.0.12', [
			{ address: '192.168.1.44', family: 'IPv4', internal: false },
		]);

		expect(selected).toBe('10.0.0.12');
	});

	test('normalizes URL-shaped explicit local-network host', () => {
		const selected = selectLocalNetworkHost('0.0.0.0', 'http://10.0.0.12:3210/settings', []);

		expect(selected).toBe('10.0.0.12');
	});

	test('rejects explicit loopback local-network host', async () => {
		const dependencies = createDependencies({
			allowRemote: true,
			hostname: '0.0.0.0',
			port: 3210,
		});

		const errors = await assertLocalNetworkAccess(
			{ baseUrl: 'http://127.0.0.1:3210', localNetworkHost: 'localhost' },
			dependencies
		);

		expect(errors[0]).toContain('selected host "localhost" is loopback-only');
	});

	test('probes LAN reachability and origin rejection', async () => {
		const dependencies = createDependencies(
			{ allowRemote: true, hostname: '0.0.0.0', port: 3210 },
			[{ address: '192.168.1.44', family: 'IPv4', internal: false }]
		);

		const errors = await assertLocalNetworkAccess(
			{ baseUrl: 'http://127.0.0.1:3210', localNetworkHost: null },
			dependencies
		);

		expect(errors).toEqual([]);
		expect(dependencies.records.map((record) => record.url)).toContain(
			'http://192.168.1.44:3210/api/v1/health'
		);
		expect(dependencies.records).toContainEqual({
			origin: 'http://192.168.1.44:3210',
			url: 'http://192.168.1.44:3210/api/v1/settings/config',
		});
		expect(dependencies.records).toContainEqual({
			origin: 'http://crawltest.invalid',
			url: 'http://192.168.1.44:3210/api/v1/settings/config',
		});
	});

	test('ignores Chromium COOP warning for HTTP LAN origins', () => {
		expect(
			isIgnorableConsoleError(
				"The Cross-Origin-Opener-Policy header has been ignored, because the URL's origin was untrustworthy."
			)
		).toBe(true);
		expect(isIgnorableConsoleError('ReferenceError: missingValue is not defined')).toBe(false);
	});
});
