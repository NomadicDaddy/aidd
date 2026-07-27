import type { IterationMetrics } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import { evaluateRunBudget } from 'aidd-shared/orchestrator/budget';

import { initialRunTotals, type RunAccumulator } from './types.ts';

/** Build the per-run accumulator (run id, timestamps, zeroed totals). */
export function createRunAccumulator(runId: string, runStartedAtMs: number): RunAccumulator {
	return {
		commandsRun: new Set<string>(),
		commitsCreated: [],
		completedFeatures: new Set<string>(),
		filesCreated: new Set<string>(),
		filesEdited: new Set<string>(),
		forcedAttributionCommits: new Set<string>(),
		runId,
		runStartedAt: new Date(runStartedAtMs).toISOString(),
		runStartedAtMs,
		runTotals: { ...initialRunTotals },
		scopeOverrun: false,
		selectedFeatures: new Set<string>(),
		toolBreakdownTotals: {},
	};
}

/** Fold one iteration's metrics into the run totals + tool breakdown. */
export function accumulateIterationMetrics(acc: RunAccumulator, metrics: IterationMetrics): void {
	acc.runTotals.iterations++;
	acc.runTotals.toolCalls += metrics.toolCallCount;
	acc.runTotals.cachedTokens += metrics.cachedTokens;
	acc.runTotals.inputTokens += metrics.inputTokens;
	acc.runTotals.outputTokens += metrics.outputTokens;
	acc.runTotals.reasoningTokens += metrics.reasoningTokens;
	acc.runTotals.costUsd += metrics.costUsd;
	acc.runTotals.errors += metrics.errorCount;
	acc.runTotals.idleWarnings += metrics.idleWarningCount;
	acc.runTotals.rateLimits += metrics.rateLimitCount;
	acc.runTotals.filesEdited += metrics.filesEditedCount;
	acc.runTotals.filesCreated += metrics.filesCreatedCount;
	for (const [tool, count] of Object.entries(metrics.toolBreakdown)) {
		acc.toolBreakdownTotals[tool] = (acc.toolBreakdownTotals[tool] ?? 0) + count;
	}
}

export function accumulateIterationEvidence(
	acc: RunAccumulator,
	input: {
		commands?: readonly string[];
		filesCreated: readonly string[];
		filesEdited: readonly string[];
	},
): void {
	for (const command of input.commands ?? []) acc.commandsRun.add(command);
	for (const path of input.filesCreated) acc.filesCreated.add(path);
	for (const path of input.filesEdited) acc.filesEdited.add(path);
}

/** Warn-only token/cost budget: surface the first overrun in the run log and never alter control
 * flow. Returns the next "already warned" flag so it fires at most once per run. */
export function warnIfBudgetExceeded(
	plan: RunPlan,
	acc: RunAccumulator,
	alreadyWarned: boolean,
): boolean {
	if (!plan.budget || alreadyWarned) return alreadyWarned;
	const verdict = evaluateRunBudget(acc.runTotals, plan.budget);
	if (!verdict.exceeded) return alreadyWarned;
	console.warn(`[budget] ${verdict.reasons.join('; ')} (warn-only; run continues)`);
	return true;
}
