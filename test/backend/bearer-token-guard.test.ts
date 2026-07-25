import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import type { ResolvedWebConfig } from 'aidd-shared/config';
import {
	bearerToken,
	createBearerTokenGuardPlugin,
	isForwardedRequest,
	isLoopbackAddress,
	isPeerAuthorized,
} from '../../backend/src/plugins/bearerTokenGuard.ts';

const TOKEN = 'super-secret-token';

function webConfig(overrides: Partial<ResolvedWebConfig> = {}): ResolvedWebConfig {
	return {
		allowRemote: true,
		allowedOrigins: [],
		allowedRoots: [],
		dataDir: '',
		hostname: '0.0.0.0',
		ignoredFolders: [],
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
		...overrides,
	};
}

// A request reaching `app.handle()` has no bound socket, so the guard sees no peer
// address and treats it as a remote (non-loopback) caller — exactly the path we gate.
function guardedApp(web: ResolvedWebConfig) {
	return new Elysia()
		.use(createBearerTokenGuardPlugin(web))
		.get('/api/v1/ping', () => ({ ok: true }))
		.get('/api/v1/ws', () => ({ ok: true }))
		.get('/open', () => ({ ok: true }));
}

describe('isLoopbackAddress', () => {
	test('recognizes loopback forms including IPv4-mapped IPv6', () => {
		expect(isLoopbackAddress('127.0.0.1')).toBe(true);
		expect(isLoopbackAddress('127.5.6.7')).toBe(true);
		expect(isLoopbackAddress('::1')).toBe(true);
		expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
	});

	test('rejects routable addresses', () => {
		expect(isLoopbackAddress('100.64.1.2')).toBe(false);
		expect(isLoopbackAddress('192.168.1.10')).toBe(false);
		expect(isLoopbackAddress('::ffff:100.64.1.2')).toBe(false);
	});
});

describe('bearerToken', () => {
	test('extracts the token from an Authorization header', () => {
		expect(bearerToken('Bearer abc123')).toBe('abc123');
		expect(bearerToken('bearer   spaced ')).toBe('spaced');
	});

	test('returns undefined for missing or malformed headers', () => {
		expect(bearerToken(undefined)).toBeUndefined();
		expect(bearerToken(null)).toBeUndefined();
		expect(bearerToken('Basic abc')).toBeUndefined();
	});
});

describe('isPeerAuthorized (direct, non-forwarded requests)', () => {
	test('allows everything when no token is configured', () => {
		expect(isPeerAuthorized({}, '100.64.1.2', null, false)).toBe(true);
	});

	test('exempts loopback peers without a token', () => {
		expect(isPeerAuthorized({ authToken: TOKEN }, '127.0.0.1', null, false)).toBe(true);
		expect(isPeerAuthorized({ authToken: TOKEN }, '::1', null, false)).toBe(true);
	});

	test('requires a matching token for remote peers', () => {
		expect(isPeerAuthorized({ authToken: TOKEN }, '100.64.1.2', null, false)).toBe(false);
		expect(isPeerAuthorized({ authToken: TOKEN }, '100.64.1.2', 'wrong', false)).toBe(false);
		expect(isPeerAuthorized({ authToken: TOKEN }, '100.64.1.2', TOKEN, false)).toBe(true);
	});

	test('denies remote peers when the peer address is unknown', () => {
		expect(isPeerAuthorized({ authToken: TOKEN }, null, null, false)).toBe(false);
		expect(isPeerAuthorized({ authToken: TOKEN }, null, TOKEN, false)).toBe(true);
	});
});

describe('isPeerAuthorized (forwarded / reverse-proxied requests)', () => {
	test('voids the loopback exemption: a proxied loopback peer must present the token', () => {
		// Caddy proxies LAN traffic from 127.0.0.1 — without the forwarded check this would
		// be auto-trusted. The forwarded flag closes that hole.
		expect(isPeerAuthorized({ authToken: TOKEN }, '127.0.0.1', null, true)).toBe(false);
		expect(isPeerAuthorized({ authToken: TOKEN }, '::1', null, true)).toBe(false);
		expect(isPeerAuthorized({ authToken: TOKEN }, '127.0.0.1', 'wrong', true)).toBe(false);
		expect(isPeerAuthorized({ authToken: TOKEN }, '127.0.0.1', TOKEN, true)).toBe(true);
	});

	test('denies a proxied request outright when no token is configured', () => {
		// An unauthenticated control plane cannot be safely exposed through a proxy.
		expect(isPeerAuthorized({}, '127.0.0.1', null, true)).toBe(false);
		expect(isPeerAuthorized({}, '127.0.0.1', TOKEN, true)).toBe(false);
	});
});

describe('isForwardedRequest', () => {
	test('detects reverse-proxy headers (Headers instance)', () => {
		expect(isForwardedRequest(new Headers({ 'x-forwarded-for': '100.64.1.2' }))).toBe(true);
		expect(isForwardedRequest(new Headers({ 'x-real-ip': '100.64.1.2' }))).toBe(true);
		expect(isForwardedRequest(new Headers({ forwarded: 'for=100.64.1.2' }))).toBe(true);
		expect(isForwardedRequest(new Headers({ authorization: 'Bearer x' }))).toBe(false);
		expect(isForwardedRequest(new Headers())).toBe(false);
	});

	test('detects reverse-proxy headers (plain record, e.g. ws.data.headers)', () => {
		expect(isForwardedRequest({ 'x-forwarded-host': 'aidd.local' })).toBe(true);
		expect(isForwardedRequest({ 'x-forwarded-for': '' })).toBe(false);
		expect(isForwardedRequest({ origin: 'http://localhost' })).toBe(false);
		expect(isForwardedRequest(undefined)).toBe(false);
	});
});

describe('createBearerTokenGuardPlugin (remote requests via app.handle)', () => {
	test('rejects /api requests without a token', async () => {
		const app = guardedApp(webConfig({ authToken: TOKEN }));
		const response = await app.handle(new Request('http://tailnet.example/api/v1/ping'));
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
	});

	test('accepts a valid bearer header', async () => {
		const app = guardedApp(webConfig({ authToken: TOKEN }));
		const response = await app.handle(
			new Request('http://tailnet.example/api/v1/ping', {
				headers: { authorization: `Bearer ${TOKEN}` },
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	test('rejects a ?token= query on a non-WebSocket /api request', async () => {
		const app = guardedApp(webConfig({ authToken: TOKEN }));
		const response = await app.handle(
			new Request(`http://tailnet.example/api/v1/ping?token=${TOKEN}`),
		);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
	});

	test('accepts a valid ?token= query only on the /api/v1/ws upgrade path', async () => {
		const app = guardedApp(webConfig({ authToken: TOKEN }));
		const response = await app.handle(
			new Request(`http://tailnet.example/api/v1/ws?token=${TOKEN}`),
		);
		expect(response.status).toBe(200);
	});

	test('rejects a wrong ?token= query on the /api/v1/ws upgrade path', async () => {
		const app = guardedApp(webConfig({ authToken: TOKEN }));
		const response = await app.handle(
			new Request('http://tailnet.example/api/v1/ws?token=nope'),
		);
		expect(response.status).toBe(401);
	});

	test('rejects a wrong token', async () => {
		const app = guardedApp(webConfig({ authToken: TOKEN }));
		const response = await app.handle(
			new Request('http://tailnet.example/api/v1/ping', {
				headers: { authorization: 'Bearer nope' },
			}),
		);
		expect(response.status).toBe(401);
	});

	test('leaves non-/api paths open', async () => {
		const app = guardedApp(webConfig({ authToken: TOKEN }));
		const response = await app.handle(new Request('http://tailnet.example/open'));
		expect(response.status).toBe(200);
	});
});

describe('createBearerTokenGuardPlugin (always mounted, no token configured)', () => {
	test('allows a direct request with no forwarding headers', async () => {
		// app.handle binds no socket, so the peer is unknown; with no token and no
		// forwarding headers this is the zero-config local case and is allowed.
		const app = guardedApp(webConfig({}));
		const response = await app.handle(new Request('http://localhost/api/v1/ping'));
		expect(response.status).toBe(200);
	});

	test('denies a forwarded request even with no token configured', async () => {
		const app = guardedApp(webConfig({}));
		const response = await app.handle(
			new Request('http://aidd.local/api/v1/ping', {
				headers: { 'x-forwarded-for': '100.64.1.2' },
			}),
		);
		expect(response.status).toBe(401);
	});

	test('denies a forwarded request from a configured-token panel without the token', async () => {
		const app = guardedApp(webConfig({ authToken: TOKEN }));
		const response = await app.handle(
			new Request('http://aidd.local/api/v1/ping', {
				headers: { 'x-forwarded-for': '100.64.1.2' },
			}),
		);
		expect(response.status).toBe(401);
	});

	test('accepts a forwarded request that presents the configured token', async () => {
		const app = guardedApp(webConfig({ authToken: TOKEN }));
		const response = await app.handle(
			new Request('http://aidd.local/api/v1/ping', {
				headers: { 'x-forwarded-for': '100.64.1.2', authorization: `Bearer ${TOKEN}` },
			}),
		);
		expect(response.status).toBe(200);
	});
});
