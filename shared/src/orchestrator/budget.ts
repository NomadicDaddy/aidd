import type { RunBudget } from '../plan/types.ts';

export interface RunBudgetTotals {
	costUsd: number;
	inputTokens: number;
	outputTokens: number;
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
	const tokens = totals.inputTokens + totals.outputTokens;
	if (budget.maxTokens !== undefined && tokens > budget.maxTokens) {
		reasons.push(`tokens ${tokens} exceeded budget ${budget.maxTokens}`);
	}
	return { exceeded: reasons.length > 0, reasons };
}
