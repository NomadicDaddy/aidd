import { describe, expect, test } from 'bun:test';
import { formatActiveDuration, formatDuration } from '../../frontend/src/lib/formatters.ts';

describe('formatActiveDuration', () => {
	const startedAt = 1_000_000;

	test('uses persisted durationMs for terminal sessions, ignoring now', () => {
		// 90s persisted duration is shown regardless of how far now has advanced.
		expect(formatActiveDuration(90_000, startedAt, startedAt + 5_000)).toBe(
			formatDuration(90_000),
		);
		expect(formatActiveDuration(90_000, startedAt, startedAt + 5_000)).toBe('1m 30s');
	});

	test('derives live elapsed time from startedAt while durationMs is null', () => {
		// 3m 25s after startedAt, with no persisted duration yet.
		expect(formatActiveDuration(null, startedAt, startedAt + 205_000)).toBe('3m 25s');
	});

	test('advances past 0s once at least a second has elapsed', () => {
		expect(formatActiveDuration(null, startedAt, startedAt + 7_000)).toBe('7s');
		expect(formatActiveDuration(undefined, startedAt, startedAt + 7_000)).toBe('7s');
	});

	test('shows 0s before any time has elapsed for an active session', () => {
		expect(formatActiveDuration(null, startedAt, startedAt)).toBe('0s');
	});

	test('falls back to formatDuration when startedAt is missing', () => {
		expect(formatActiveDuration(null, null, startedAt + 10_000)).toBe('0s');
		expect(formatActiveDuration(null, undefined, startedAt + 10_000)).toBe('0s');
	});

	test('treats a persisted zero durationMs as terminal, not active', () => {
		// durationMs === 0 is a real persisted value and must not fall through to now - startedAt.
		expect(formatActiveDuration(0, startedAt, startedAt + 60_000)).toBe('0s');
	});
});
