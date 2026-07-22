import { describe, expect, test } from 'bun:test';

import { isWebSocketUpgradeAuthorized } from '../../backend/src/routes/ws.ts';

const TOKEN = 'super-secret-token';

describe('isWebSocketUpgradeAuthorized', () => {
	test('forwarded upgrade is admitted with a valid ?token= query (the proxied-UI path)', () => {
		// Browsers cannot set headers on the WS handshake, so the token arrives as a query
		// param. This is the exact scenario the auth change documents as supported.
		expect(
			isWebSocketUpgradeAuthorized(
				{ authToken: TOKEN },
				{
					headers: { 'x-forwarded-for': '100.64.1.2' },
					query: { token: TOKEN },
					remoteAddress: '127.0.0.1',
				}
			)
		).toBe(true);
	});

	test('forwarded upgrade is admitted with a valid Authorization header', () => {
		expect(
			isWebSocketUpgradeAuthorized(
				{ authToken: TOKEN },
				{
					headers: { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '100.64.1.2' },
					remoteAddress: '127.0.0.1',
				}
			)
		).toBe(true);
	});

	test('forwarded upgrade is rejected with a wrong or missing token', () => {
		expect(
			isWebSocketUpgradeAuthorized(
				{ authToken: TOKEN },
				{ headers: { 'x-forwarded-for': '100.64.1.2' }, query: { token: 'nope' } }
			)
		).toBe(false);
		expect(
			isWebSocketUpgradeAuthorized(
				{ authToken: TOKEN },
				{ headers: { 'x-forwarded-for': '100.64.1.2' } }
			)
		).toBe(false);
	});

	test('forwarded upgrade is rejected outright when no token is configured', () => {
		expect(
			isWebSocketUpgradeAuthorized(
				{},
				{ headers: { 'x-forwarded-for': '100.64.1.2' }, query: { token: TOKEN } }
			)
		).toBe(false);
	});

	test('direct loopback upgrade keeps the zero-config local exemption', () => {
		expect(isWebSocketUpgradeAuthorized({}, { headers: {}, remoteAddress: '127.0.0.1' })).toBe(
			true
		);
		expect(
			isWebSocketUpgradeAuthorized(
				{ authToken: TOKEN },
				{ headers: {}, remoteAddress: '127.0.0.1' }
			)
		).toBe(true);
	});

	test('direct non-loopback upgrade requires a token (via header or query)', () => {
		expect(
			isWebSocketUpgradeAuthorized(
				{ authToken: TOKEN },
				{ headers: {}, remoteAddress: '100.64.1.2' }
			)
		).toBe(false);
		expect(
			isWebSocketUpgradeAuthorized(
				{ authToken: TOKEN },
				{ headers: {}, query: { token: TOKEN }, remoteAddress: '100.64.1.2' }
			)
		).toBe(true);
	});
});
