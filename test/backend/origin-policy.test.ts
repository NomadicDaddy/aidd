import { describe, expect, test } from 'bun:test';
import type { ResolvedWebConfig } from 'aidd-shared/config';
import { buildAllowedOrigins, isAllowedOrigin } from '../../backend/src/originPolicy.ts';
import { shouldEmitCrossOriginOpenerPolicy } from '../../backend/src/plugins/securityHeaders.ts';

function webConfig(input: Partial<ResolvedWebConfig>): ResolvedWebConfig {
	return {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: ['D:/applications'],
		dataDir: 'D:/applications/aidd/data',
		hostname: '127.0.0.1',
		ignoredFolders: ['.git'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		autoChainLimit: 3,
		autoChainRuns: false,
		useWorktrees: false,
		port: 3210,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		showSpernakitProject: false,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: false,
		...input,
	};
}

describe('origin policy', () => {
	test('allows loopback aliases for loopback listeners', () => {
		const config = webConfig({ hostname: '127.0.0.2' });
		const origins = buildAllowedOrigins(config, []);

		expect(origins.has('http://127.0.0.2:3210')).toBe(true);
		expect(origins.has('http://localhost:3210')).toBe(true);
		expect(isAllowedOrigin(config, 'http://localhost:3210')).toBe(true);
		expect(isAllowedOrigin(config, 'http://example.com:3210')).toBe(false);
	});

	test('allows explicit configured origins', () => {
		const config = webConfig({
			allowedOrigins: ['http://demo-host:3210/', 'http://192.0.2.10:3210'],
			allowRemote: true,
			hostname: '0.0.0.0',
		});
		const origins = buildAllowedOrigins(config, []);

		expect(origins.has('http://demo-host:3210')).toBe(true);
		expect(origins.has('http://192.0.2.10:3210')).toBe(true);
	});

	test('allows local interface origins for wildcard listeners', () => {
		const config = webConfig({ allowRemote: true, hostname: '0.0.0.0' });
		const origins = buildAllowedOrigins(config, [
			{ address: '127.0.0.1', family: 'IPv4', internal: true },
			{ address: '192.168.1.44', family: 'IPv4', internal: false },
			{ address: 'fe80::1234', family: 'IPv6', internal: false },
		]);

		expect(origins.has('http://192.168.1.44:3210')).toBe(true);
		expect(origins.has('http://[fe80::1234]:3210')).toBe(true);
		expect(origins.has('http://127.0.0.1:3210')).toBe(true);
		expect(origins.has('http://localhost:3210')).toBe(true);
	});

	test('emits COOP only for trustworthy origins', () => {
		expect(shouldEmitCrossOriginOpenerPolicy(new URL('http://localhost:3210'))).toBe(true);
		expect(shouldEmitCrossOriginOpenerPolicy(new URL('http://127.0.0.1:3210'))).toBe(true);
		expect(shouldEmitCrossOriginOpenerPolicy(new URL('https://demo-host:3210'))).toBe(true);
		expect(shouldEmitCrossOriginOpenerPolicy(new URL('http://demo-host:3210'))).toBe(false);
		expect(shouldEmitCrossOriginOpenerPolicy(new URL('http://192.168.1.33:3210'))).toBe(false);
	});
});
