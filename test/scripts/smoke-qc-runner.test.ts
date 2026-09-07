import { describe, expect, test } from 'bun:test';

import {
	getConcurrentTestBlocker,
	PROJECTED_WALL_TIME_WARNING_MS,
	projectUncachedWallTimeMs,
	shouldWarnProjectedWallTime,
} from '../../scripts/smoke-qc.ts';
import type { SmokeCacheStatusEntry } from '../../scripts/smoke-cache.ts';

const ACTIVE_RUN = {
	pid: 4321,
	rootDir: 'D:/applications/aidd',
	startedAt: 1,
};

describe('smoke:qc required-step blockers', () => {
	test('fails when the required test step cannot run', () => {
		const blocker = getConcurrentTestBlocker('test', ACTIVE_RUN);

		expect(blocker?.exitCode).toBe(1);
		expect(blocker?.message).toContain('tests were NOT validated by this run');
	});

	test('does not block unrelated steps or an unlocked test step', () => {
		expect(getConcurrentTestBlocker('lint', ACTIVE_RUN)).toBeNull();
		expect(getConcurrentTestBlocker('test', undefined)).toBeNull();
	});
});

function status(valid: boolean, durationMs: null | number): SmokeCacheStatusEntry {
	return {
		cacheable: true,
		dependencyCount: 1,
		dependencyHash: 'hash',
		durationMs,
		recordedAt: null,
		result: 'pass',
		step: 'example',
		valid,
	};
}

describe('smoke:qc wall-time projection', () => {
	test('sums only invalid steps that have measured durations', () => {
		expect(
			projectUncachedWallTimeMs([
				status(false, 200),
				status(true, 500),
				status(false, null),
				status(false, 300),
			]),
		).toBe(500);
		expect(projectUncachedWallTimeMs([status(true, 500)])).toBe(0);
	});

	test('warns at the projected wall-time threshold', () => {
		expect(shouldWarnProjectedWallTime(PROJECTED_WALL_TIME_WARNING_MS - 1)).toBe(false);
		expect(shouldWarnProjectedWallTime(PROJECTED_WALL_TIME_WARNING_MS)).toBe(true);
	});
});
