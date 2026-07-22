import { describe, expect, test } from 'bun:test';
import type { AgentEvent } from 'aidd-shared/backends/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import type { OrchestratorDeps } from '../../cli/src/orchestrator/run/types.ts';

import {
	buildRateLimitBudgetSummary,
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
			runStartedAtMs
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
			Date.now()
		);
		expect(result.backoffExceedsDeadline).toBe(false);
		expect(result.stopRequested).toBe(false);
	});
});
