import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import type { CycleExecutorDeps } from '../../backend/src/services/director/cycleExecutor.ts';

import { executeCycle, runDirectCycle } from '../../backend/src/services/director/cycleExecutor.ts';
import { isUnrecoverableDirectAiError } from '../../backend/src/services/director/directAiFallback.ts';
import { HttpError } from '../../backend/src/services/errors.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// audit-ai-1790856991: every Direct AI error fell back to a full CLI Director run, including the
// configuration and credential faults a CLI run cannot cure, so a persistent fault turned every
// scheduled cycle into a slower, costlier run. Transient faults still fall back; the others fail
// the cycle before any run is launched.
const fleetSummary = { fleetAggregations: { fleetHealthScore: 90 }, projects: [] } as never;

function deps(failure: unknown, launched: string[]): CycleExecutorDeps {
	return {
		chatService: { recentChatMessages: async () => [] },
		db: {
			select() {
				throw new Error('no database in this test');
			},
		},
		deleteActiveStage() {},
		directAiService: {
			async completeJson() {
				throw failure;
			},
			isSurfaceEnabled: () => true,
			resolveSurfaceMeta: () => ({ model: 'm', provider: 'test', reasoningEffort: 'low' }),
		},
		disposed: () => false,
		getConfig: () => ({ web: { dataDir: join(import.meta.dir) } }),
		persistCycleResult: async () => {},
		profileService: { getProfile: async () => ({ backend: 'native', reasoningEffort: 'low' }) },
		runService: {
			launchRun: async (input: { directorCycleId?: string }) => {
				launched.push(input.directorCycleId ?? '?');
				return { id: 'run_1' };
			},
		},
		setCycleStage() {},
	} as unknown as CycleExecutorDeps;
}

describe('Direct AI director cycle fallback', () => {
	test('a request timeout, a provider 5xx and a non-JSON completion fall back to the CLI', async () => {
		for (const failure of [
			new HttpError('Direct AI directorCycle request timed out after 120 seconds', 504),
			new HttpError('Direct AI directorCycle response was not valid JSON', 502),
			new Error('test request failed: HTTP 503 upstream unavailable'),
		]) {
			expect(isUnrecoverableDirectAiError(failure)).toBe(false);
			const result = await runDirectCycle(
				deps(failure, []),
				'cycle',
				'out.json',
				fleetSummary,
				undefined,
			);
			expect(result).toEqual({ directAiError: failure.message, output: null });
		}
	});

	test('a configuration error and a refused credential fail the cycle instead', async () => {
		for (const failure of [
			new HttpError('Direct AI provider "x" has no API key configured', 400),
			new Error('test request failed: HTTP 401 Unauthorized'),
			new Error('test request failed: HTTP 403 Forbidden'),
		]) {
			expect(isUnrecoverableDirectAiError(failure)).toBe(true);
			await expect(
				runDirectCycle(deps(failure, []), 'cycle', 'out.json', fleetSummary, undefined),
			).rejects.toBe(failure);
		}
	});

	test('the failed cycle launches no CLI run', async () => {
		const dir = await testTempDir('aidd-direct-cycle-');
		const launched: string[] = [];
		try {
			const failure = new Error('test request failed: HTTP 401 Unauthorized');
			await expect(
				executeCycle(
					deps(failure, launched),
					'cycle',
					dir,
					fleetSummary,
					{},
					dir,
					'automatic',
				),
			).rejects.toBe(failure);
			expect(launched).toEqual([]);
		} finally {
			await removeTempTree(dir);
		}
	});
});
