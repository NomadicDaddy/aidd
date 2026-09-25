import { describe, expect, test } from 'bun:test';
import { budgetTokens, evaluateRunBudget } from '../../shared/src/orchestrator/budget.ts';

const totals = (costUsd: number, inputTokens: number, outputTokens: number) => ({
	costUsd,
	inputTokens,
	outputTokens,
});

describe('evaluateRunBudget', () => {
	test('is within budget when no ceiling is set', () => {
		const verdict = evaluateRunBudget(totals(1000, 1_000_000, 1_000_000), {});
		expect(verdict.exceeded).toBe(false);
		expect(verdict.reasons).toEqual([]);
	});

	test('flags a cost overrun', () => {
		const verdict = evaluateRunBudget(totals(12.5, 0, 0), { maxCostUsd: 10 });
		expect(verdict.exceeded).toBe(true);
		expect(verdict.reasons).toHaveLength(1);
		expect(verdict.reasons[0]).toContain('cost');
	});

	test('flags a token overrun on combined input + output', () => {
		const verdict = evaluateRunBudget(totals(0, 600, 600), { maxTokens: 1000 });
		expect(verdict.exceeded).toBe(true);
		expect(verdict.reasons[0]).toContain('tokens');
	});

	test('stays within budget at the exact ceiling (strictly greater trips it)', () => {
		expect(evaluateRunBudget(totals(10, 0, 0), { maxCostUsd: 10 }).exceeded).toBe(false);
		expect(evaluateRunBudget(totals(0, 500, 500), { maxTokens: 1000 }).exceeded).toBe(false);
	});

	test('reports both ceilings when both are exceeded', () => {
		const verdict = evaluateRunBudget(totals(20, 800, 800), {
			maxCostUsd: 10,
			maxTokens: 1000,
		});
		expect(verdict.exceeded).toBe(true);
		expect(verdict.reasons).toHaveLength(2);
	});
});

describe('budgetTokens', () => {
	test('discounts the cache-read share of input and counts the rest in full', () => {
		// The summon review step: 374 fresh + 13,437,047 cache-read + 831,619 cache-creation input,
		// 66,442 output. At full weight that was 14.3M against a 10M ceiling.
		const input = 374 + 13_437_047 + 831_619;
		const counted = budgetTokens({
			cachedTokens: 13_437_047,
			costUsd: 11.15,
			inputTokens: input,
			outputTokens: 66_442,
		});
		expect(counted).toBe(Math.round(374 + 831_619 + 13_437_047 * 0.1 + 66_442));
		expect(
			evaluateRunBudget(
				{
					cachedTokens: 13_437_047,
					costUsd: 11.15,
					inputTokens: input,
					outputTokens: 66_442,
				},
				{ maxTokens: 10_000_000 },
			).exceeded,
		).toBe(false);
	});

	test('without a cache share it is the plain sum, and a cache claim never exceeds input', () => {
		expect(budgetTokens(totals(0, 600, 400))).toBe(1000);
		expect(
			budgetTokens({ cachedTokens: 5000, costUsd: 0, inputTokens: 1000, outputTokens: 0 }),
		).toBe(100);
	});
});
