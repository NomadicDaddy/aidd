import { describe, expect, test } from 'bun:test';
import type { AgentEvent } from 'aidd-shared/backends/types';
import type { RunPlan } from 'aidd-shared/plan/types';
import { readProviderRests } from 'aidd-shared/provider-rest/store';

import type { OrchestratorDeps } from '../../cli/src/orchestrator/run/types.ts';
import { testTempDir } from '../_helpers/temp.ts';

import {
	buildRateLimitBudgetSummary,
	handlePreRunChecks,
	handleRateLimit,
} from '../../cli/src/orchestrator/run/run-gates.ts';

function makePlan(timeoutSeconds: number): RunPlan {
	return {
		backend: 'native',
		outputPolicy: {
			rateLimitBackoffSeconds: 300,
			rateLimitBufferSeconds: 60,
			timeoutSeconds,
		},
		stopPolicy: { stopFile: '.aidd/.stop' },
	} as unknown as RunPlan;
}

const deps = {
	store: { hasStopRequested: async () => false },
} as unknown as OrchestratorDeps;

describe('handleRateLimit — wall-clock deadline', () => {
	test('skips the backoff sleep when it crosses the deadline without claiming time expired', async () => {
		// 10s of wall-clock budget left, but the fallback backoff is 300s: sleeping is pointless.
		const runStartedAtMs = Date.now() - (3600 - 10) * 1000;
		const startedAt = Date.now();
		const result = await handleRateLimit(
			deps,
			makePlan(3600),
			[],
			new AbortController(),
			1,
			runStartedAtMs,
			undefined,
		);
		expect(result.backoffExceedsDeadline).toBe(true);
		expect(result.stopRequested).toBe(false);
		const summary = buildRateLimitBudgetSummary('rate limited', makePlan(3600));
		expect(summary).toStartWith('rate limited; rate_limit_wait_exceeds_budget:');
		expect(summary).toContain('timeoutSeconds=3600');
		expect(summary).not.toContain('wall_clock_timeout');
		// The 300s fallback sleep must not have run.
		expect(Date.now() - startedAt).toBeLessThan(5000);
	});

	test('continues normally when the reset already passed and budget remains', async () => {
		const events: AgentEvent[] = [
			{
				resetAt: new Date(Date.now() - 120_000).toISOString(),
				type: 'rate_limit',
			} as AgentEvent,
		];
		const result = await handleRateLimit(
			deps,
			makePlan(3600),
			events,
			new AbortController(),
			1,
			Date.now(),
			undefined,
		);
		expect(result.backoffExceedsDeadline).toBe(false);
		expect(result.stopRequested).toBe(false);
	});
});

describe('handleRateLimit — provider rest', () => {
	// A reset 20 minutes out with 10s of budget left: the run ends without sleeping, which keeps
	// the test fast, and the rest is written before that decision either way.
	async function limitedRun(limitedBackend: 'codex' | undefined): Promise<string> {
		const dataDir = await testTempDir('run-gates-rest-');
		const events: AgentEvent[] = [
			{
				resetAt: new Date(Date.now() + 20 * 60_000).toISOString(),
				type: 'rate_limit',
			} as AgentEvent,
		];
		await handleRateLimit(
			{ ...deps, dataDir },
			makePlan(3600),
			events,
			new AbortController(),
			1,
			Date.now() - (3600 - 10) * 1000,
			limitedBackend,
		);
		return dataDir;
	}

	test('a rate limit with a reported reset rests the limited backend until it, plus the buffer', async () => {
		const dataDir = await limitedRun('codex');
		const rests = await readProviderRests(dataDir);
		expect(rests.map((rest) => [rest.backend, rest.source])).toEqual([['codex', 'rate_limit']]);
		const minutes = (Date.parse(rests[0]?.until ?? '') - Date.now()) / 60_000;
		expect(minutes).toBeGreaterThan(20.5);
		expect(minutes).toBeLessThan(21.5);
	});

	test('a limit whose backend is not known rests nothing', async () => {
		const dataDir = await limitedRun(undefined);
		expect(await readProviderRests(dataDir)).toEqual([]);
	});
});

describe('handlePreRunChecks — stop before the run', () => {
	test('a stop found before the first iteration is recorded as stopped, not completed', async () => {
		const moves: unknown[] = [];
		const result = await handlePreRunChecks(
			makePlan(3600),
			{ store: { hasStopRequested: async () => true } } as unknown as OrchestratorDeps,
			(move) => moves.push(move),
		);
		expect(result).toEqual({
			exitCode: 0,
			stopReason: 'stop_requested',
			summary: 'stop requested before run',
		});
		expect(moves).toEqual([{ reason: 'stop requested before run', type: 'stopped' }]);
	});
});
