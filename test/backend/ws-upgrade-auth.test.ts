import { describe, expect, test } from 'bun:test';

import { isWebSocketUpgradeAuthorized } from '../../backend/src/routes/ws.ts';

const TOKEN = 'super-secret-token';

describe('isWebSocketUpgradeAuthorized', () => {
	test('forwarded upgrade is admitted with a valid ?token= query (the proxied-UI path)', () => {
		// Browsers cannot set headers on the WS handshake, so the token arrives as a query
		// param. This is the exact scenario the auth change documents as supported.
		expect(
			isWebSocketUpgradeAuthorized(
				{ allowRemote: true, authToken: TOKEN },
				{
					headers: { 'x-forwarded-for': '100.64.1.2' },
					query: { token: TOKEN },
					remoteAddress: '127.0.0.1',
				},
			),
		).toBe(true);
	});

	test('forwarded upgrade is admitted with a valid Authorization header', () => {
		expect(
			isWebSocketUpgradeAuthorized(
				{ allowRemote: true, authToken: TOKEN },
				{
					headers: { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '100.64.1.2' },
					remoteAddress: '127.0.0.1',
				},
			),
		).toBe(true);
	});

	test('forwarded upgrade is rejected with a wrong or missing token', () => {
		expect(
			isWebSocketUpgradeAuthorized(
				{ allowRemote: true, authToken: TOKEN },
				{ headers: { 'x-forwarded-for': '100.64.1.2' }, query: { token: 'nope' } },
			),
		).toBe(false);
		expect(
			isWebSocketUpgradeAuthorized(
				{ allowRemote: true, authToken: TOKEN },
				{ headers: { 'x-forwarded-for': '100.64.1.2' } },
			),
		).toBe(false);
	});

	test('forwarded upgrade is rejected outright when no token is configured', () => {
		expect(
			isWebSocketUpgradeAuthorized(
				{ allowRemote: true },
				{ headers: { 'x-forwarded-for': '100.64.1.2' }, query: { token: TOKEN } },
			),
		).toBe(false);
	});

	test('direct loopback upgrade keeps the zero-config local exemption', () => {
		expect(
			isWebSocketUpgradeAuthorized(
				{ allowRemote: false },
				{ headers: {}, remoteAddress: '127.0.0.1' },
			),
		).toBe(true);
		expect(
			isWebSocketUpgradeAuthorized(
				{ allowRemote: true, authToken: TOKEN },
				{ headers: {}, remoteAddress: '127.0.0.1' },
			),
		).toBe(true);
	});

	test('direct non-loopback upgrade requires a token (via header or query)', () => {
		expect(
			isWebSocketUpgradeAuthorized(
				{ allowRemote: true, authToken: TOKEN },
				{ headers: {}, remoteAddress: '100.64.1.2' },
			),
		).toBe(false);
		expect(
			isWebSocketUpgradeAuthorized(
				{ allowRemote: true, authToken: TOKEN },
				{ headers: {}, query: { token: TOKEN }, remoteAddress: '100.64.1.2' },
			),
		).toBe(true);
	});

	test('direct non-loopback upgrade is refused on a remote-bound panel with no token', () => {
		// The upgrade shares `isPeerAuthorized` with the HTTP guard, so it inherits the rule that
		// a tokenless panel on the network serves loopback only. A WebSocket is the one thing on
		// this control plane that would stay open for the rest of the session.
		expect(
			isWebSocketUpgradeAuthorized(
				{ allowRemote: true },
				{ headers: {}, remoteAddress: '100.64.1.2' },
			),
		).toBe(false);
		expect(isWebSocketUpgradeAuthorized({ allowRemote: true }, { headers: {} })).toBe(false);
	});
});
