import { describe, expect, test } from 'bun:test';
import { evaluateRunBudget } from '../../shared/src/orchestrator/budget.ts';

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
