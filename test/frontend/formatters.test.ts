import { describe, expect, test } from 'bun:test';
import {
	formatActiveDuration,
	formatDuration,
	formatRelativeAge,
	partitionPercentages,
	utf8ByteLength,
} from '../../frontend/src/lib/formatters.ts';

describe('partitionPercentages', () => {
	test('reconciles uneven whole-number shares with their parent total', () => {
		expect(partitionPercentages([21, 3], 24)).toEqual([88, 12]);
		expect(partitionPercentages([1, 2], 3)).toEqual([33, 67]);
	});

	test('resolves equal remainders deterministically without changing displayed precision', () => {
		expect(partitionPercentages([1, 1], 2)).toEqual([50, 50]);
		expect(partitionPercentages([0, 0], 0)).toEqual([0, 0]);
	});
});

describe('formatRelativeAge', () => {
	test('describes future and past instants from the same shared formatter', () => {
		const now = Date.now();
		expect(formatRelativeAge(new Date(now + 121 * 60_000).toISOString())).toBe('in 2h');
		expect(formatRelativeAge(new Date(now - 121 * 60_000).toISOString())).toBe('2h ago');
	});

	test('keeps near and invalid instants concise', () => {
		expect(formatRelativeAge(new Date(Date.now() + 10_000).toISOString())).toBe('just now');
		expect(formatRelativeAge('not-a-date')).toBe('—');
	});
});

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

describe('utf8ByteLength', () => {
	// The console compares this against a size read from the filesystem, so it has to agree with
	// TextEncoder exactly — a shortfall reads as hidden output rather than as a unit mismatch.
	test('matches TextEncoder across ASCII, multi-byte, and astral text', () => {
		const samples = [
			'',
			'plain ascii transcript line',
			'│ box drawing ├',
			'テストの出力',
			'emoji 👍🏽 and 🧪',
			'mixed: ok → 完了 ✅',
		];
		const encoder = new TextEncoder();
		for (const sample of samples) {
			expect(utf8ByteLength(sample)).toBe(encoder.encode(sample).length);
		}
	});

	test('counts an unpaired surrogate as the replacement character it encodes to', () => {
		const lone = 'a�';
		expect(utf8ByteLength(lone)).toBe(new TextEncoder().encode(lone).length);
	});
});
