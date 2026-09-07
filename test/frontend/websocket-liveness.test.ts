import { describe, expect, test } from 'bun:test';
import { evaluateLiveness } from '../../frontend/src/hooks/webSocketLiveness.ts';

const TIMEOUT_MS = 40000;

describe('evaluateLiveness (WebSocket half-open watchdog)', () => {
	test('leaves a non-open socket alone (connect/close/retry owns those states)', () => {
		expect(
			evaluateLiveness({
				isOpen: false,
				lastMessageAt: 0,
				now: 1_000_000,
				timeoutMs: TIMEOUT_MS,
			}),
		).toBe('idle');
	});

	test('pings an open socket that has been silent within the window', () => {
		const now = 1_000_000;
		expect(
			evaluateLiveness({
				isOpen: true,
				lastMessageAt: now - (TIMEOUT_MS - 1),
				now,
				timeoutMs: TIMEOUT_MS,
			}),
		).toBe('ping');
	});

	test('pings (never reconnects) when no frame has been timestamped yet', () => {
		// lastMessageAt is always primed when a connection is initiated, but guard the null case so a
		// brand-new socket is probed rather than torn down.
		expect(
			evaluateLiveness({
				isOpen: true,
				lastMessageAt: null,
				now: 1_000_000,
				timeoutMs: TIMEOUT_MS,
			}),
		).toBe('ping');
	});

	test('reconnects an open socket silent past the staleness window (half-open detection)', () => {
		const now = 1_000_000;
		expect(
			evaluateLiveness({
				isOpen: true,
				lastMessageAt: now - (TIMEOUT_MS + 1),
				now,
				timeoutMs: TIMEOUT_MS,
			}),
		).toBe('reconnect');
	});

	test('does not reconnect exactly at the boundary (strict greater-than)', () => {
		const now = 1_000_000;
		expect(
			evaluateLiveness({
				isOpen: true,
				lastMessageAt: now - TIMEOUT_MS,
				now,
				timeoutMs: TIMEOUT_MS,
			}),
		).toBe('ping');
	});
});
