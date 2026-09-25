import type { RunBudget } from '../plan/types.ts';

export interface RunBudgetTotals {
	/** The cache-read share of `inputTokens` (aidd's convention: cachedTokens ⊂ inputTokens). */
	cachedTokens?: number;
	costUsd: number;
	inputTokens: number;
	outputTokens: number;
}

/**
 * How much a cache-read token counts against `maxTokens`. Providers bill cache reads at a tenth
 * of fresh input (Anthropic 0.1x; OpenAI's cached input is 0.1x to 0.5x), and a long agent turn
 * re-reads its whole context from cache every step. Counted at full weight, a skill run whose
 * tokens were 94% cache reads reported 14.3M against a 10M ceiling while its $11.15 cost sat
 * under half of its $25 cost ceiling.
 */
export const CACHE_READ_TOKEN_WEIGHT = 0.1;

/** Tokens as the budget counts them: fresh input and output in full, cache reads discounted. */
export function budgetTokens(totals: RunBudgetTotals): number {
	const cached = Math.min(totals.cachedTokens ?? 0, totals.inputTokens);
	return Math.round(
		totals.inputTokens - cached + cached * CACHE_READ_TOKEN_WEIGHT + totals.outputTokens,
	);
}

export interface RunBudgetVerdict {
	/** True when at least one configured ceiling is exceeded. */
	exceeded: boolean;
	/** Human-readable explanations, one per exceeded ceiling (empty when within budget). */
	reasons: string[];
}

/** Compare a run's accumulated totals against its soft budget. Pure and warn-only: callers
 * surface `reasons` but must NOT alter control flow on `exceeded`. A ceiling left undefined is
 * treated as unlimited. */
export function evaluateRunBudget(totals: RunBudgetTotals, budget: RunBudget): RunBudgetVerdict {
	const reasons: string[] = [];
	if (budget.maxCostUsd !== undefined && totals.costUsd > budget.maxCostUsd) {
		reasons.push(
			`cost $${totals.costUsd.toFixed(2)} exceeded budget $${budget.maxCostUsd.toFixed(2)}`,
		);
	}
	const tokens = budgetTokens(totals);
	if (budget.maxTokens !== undefined && tokens > budget.maxTokens) {
		const cached = totals.cachedTokens ?? 0;
		const detail = cached > 0 ? ` (cache reads weighted ${CACHE_READ_TOKEN_WEIGHT}x)` : '';
		reasons.push(`tokens ${tokens}${detail} exceeded budget ${budget.maxTokens}`);
	}
	return { exceeded: reasons.length > 0, reasons };
}
