import { describe, expect, test } from 'bun:test';

import type { RunPlan } from 'aidd-shared/plan/types';

import type { OrchestratorDeps, RunAccumulator } from '../../cli/src/orchestrator/run/types.ts';

import { createRunAccumulator } from '../../cli/src/orchestrator/run/run-accumulator.ts';
import {
	endRunIfBudgetTooThinForIteration,
	estimatedIterationCostMs,
} from '../../cli/src/orchestrator/run/run-ending.ts';

function makePlan(timeoutSeconds: number): RunPlan {
	return {
		backend: 'native',
		mode: 'coding',
		// noClean so the ledger write does not sweep the real repo's .aidd/iterations.
		outputPolicy: { noClean: true, timeoutSeconds },
		projectDir: '.',
		prompt: { fragments: [], phase: 'in-progress' },
		reasoningEffort: 'low',
		scope: { maxIterations: 10 },
	} as unknown as RunPlan;
}

function makeAcc(durationsMs: number[]): RunAccumulator {
	const acc = createRunAccumulator('run_test', Date.now());
	acc.iterationDurationsMs.push(...durationsMs);
	acc.runTotals.iterations = durationsMs.length;
	return acc;
}

function makeDeps(recorded: { stopReason?: string }): OrchestratorDeps {
	return {
		store: {
			appendRunSummary: async (row: { stopReason: string }) => {
				recorded.stopReason = row.stopReason;
			},
		},
	} as unknown as OrchestratorDeps;
}

describe('estimatedIterationCostMs', () => {
	test('returns undefined until two iterations have been observed', () => {
		const plan = makePlan(3600);
		expect(estimatedIterationCostMs(makeAcc([]), plan)).toBeUndefined();
		expect(estimatedIterationCostMs(makeAcc([600_000]), plan)).toBeUndefined();
	});

	test('uses the median so one pathological iteration cannot shut the run down early', () => {
		// Mean would be 8.4 min; the median ignores the 40-minute outlier.
		const acc = makeAcc([300_000, 300_000, 2_400_000, 300_000, 300_000]);
		expect(estimatedIterationCostMs(acc, makePlan(36_000))).toBe(300_000);
	});

	// A fraction-of-budget cap would report 15m here (25% of 60m) and wave through an iteration
	// with 17m left that then dies mid-edit — the exact failure the guard exists to prevent.
	test('reports the observed cost even when it is a large share of the budget', () => {
		const acc = makeAcc([1_200_000, 1_200_000]);
		expect(estimatedIterationCostMs(acc, makePlan(3600))).toBe(1_200_000);
	});
});

describe('endRunIfBudgetTooThinForIteration', () => {
	test('proceeds when the remaining budget covers another iteration', async () => {
		const plan = makePlan(3600);
		const acc = makeAcc([300_000, 300_000]);
		const exit = await endRunIfBudgetTooThinForIteration({
			acc,
			deps: makeDeps({}),
			lastSummary: 'iteration 2 complete',
			move: () => {},
			plan,
			runStartedAtMs: Date.now() - 600_000,
		});
		expect(exit).toBeUndefined();
	});

	test('ends the run cleanly when less budget remains than an iteration costs', async () => {
		const plan = makePlan(3600);
		const acc = makeAcc([600_000, 600_000]);
		const recorded: { stopReason?: string } = {};
		let completedSummary: string | undefined;
		const exit = await endRunIfBudgetTooThinForIteration({
			acc,
			deps: makeDeps(recorded),
			lastSummary: 'iteration 5 complete',
			move: (state) => {
				if (state.type === 'complete') completedSummary = state.summary;
			},
			plan,
			// 4.7 minutes left against a 10-minute median: the wall-clock watchdog would have
			// killed the next iteration mid-edit.
			runStartedAtMs: Date.now() - 3_318_000,
		});
		expect(exit).toBe(0);
		expect(recorded.stopReason).toBe('wall_clock_budget');
		// Two iterations have finished, so the one being declined is the third.
		expect(completedSummary).toContain('stopped before iteration 3');
		expect(completedSummary).toContain('wall-clock budget remained');
	});

	// The long-iteration case a fraction-of-budget cap would mishandle: 20-minute iterations on a
	// 60-minute budget with 17 minutes left must stop, not dispatch.
	test('stops when a long iteration would not fit in the remaining budget', async () => {
		const recorded: { stopReason?: string } = {};
		const exit = await endRunIfBudgetTooThinForIteration({
			acc: makeAcc([1_200_000, 1_200_000]),
			deps: makeDeps(recorded),
			lastSummary: 'iteration 2 complete',
			move: () => {},
			plan: makePlan(3600),
			runStartedAtMs: Date.now() - 2_580_000,
		});
		expect(exit).toBe(0);
		expect(recorded.stopReason).toBe('wall_clock_budget');
	});

	test('proceeds when too few iterations have run to estimate a cost', async () => {
		const exit = await endRunIfBudgetTooThinForIteration({
			acc: makeAcc([600_000]),
			deps: makeDeps({}),
			lastSummary: 'iteration 1 complete',
			move: () => {},
			plan: makePlan(3600),
			runStartedAtMs: Date.now() - 3_580_000,
		});
		expect(exit).toBeUndefined();
	});
});
