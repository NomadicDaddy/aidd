import type { ModeResult, SelectedWork } from 'aidd-shared/modes/types';
import type { IterationMetrics } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import { evaluateRunBudget } from 'aidd-shared/orchestrator/budget';

import type { GitCommitSummary } from './types.ts';

import { initialRunTotals, type RunAccumulator } from './types.ts';

/** Build the per-run accumulator (run id, timestamps, zeroed totals). */
export function createRunAccumulator(runId: string, runStartedAtMs: number): RunAccumulator {
	return {
		auditFindings: {},
		commandsRun: new Set<string>(),
		commitsCreated: [],
		completedFeatures: new Set<string>(),
		destroyedLeasedFeatures: [],
		filesCreated: new Set<string>(),
		filesEdited: new Set<string>(),
		forcedAttributionCommits: new Set<string>(),
		iterationDurationsMs: [],
		pendingCarryoverNotes: [],
		runId,
		runStartedAt: new Date(runStartedAtMs).toISOString(),
		runStartedAtMs,
		runTotals: { ...initialRunTotals },
		scopeOverrun: false,
		scopeOverrunIterations: 0,
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
	modeResult?: ModeResult,
): void {
	for (const command of input.commands ?? []) acc.commandsRun.add(command);
	for (const path of input.filesCreated) acc.filesCreated.add(path);
	for (const path of input.filesEdited) acc.filesEdited.add(path);
	const auditFindings = modeResult?.artifacts?.auditFindings;
	if (typeof auditFindings !== 'object' || auditFindings === null) return;
	for (const [auditName, count] of Object.entries(auditFindings)) {
		if (typeof count !== 'number' || !Number.isFinite(count)) continue;
		acc.auditFindings[auditName] = (acc.auditFindings[auditName] ?? 0) + count;
	}
}

/** Fold the iteration's commits into the run ledger, and return the commits an audit iteration was
 * never supposed to produce (audits are read-only, so theirs are reported and left unattributed). */
export function accumulateIterationCommits(input: {
	acc: RunAccumulator;
	commits: readonly GitCommitSummary[];
	mode: RunPlan['mode'];
	work: SelectedWork;
}): string[] {
	const { acc, commits, mode, work } = input;
	if (mode === 'audit') {
		if (commits.length === 0) return [];
		const hashes = commits.map((commit) => commit.hash);
		console.warn(
			`[audit-mode] ${hashes.length} unexpected commit(s) landed during audit iteration; not attributing to features: ${hashes.join(', ')}`,
		);
		return hashes;
	}
	acc.commitsCreated.push(...commits);
	acc.runTotals.commitsCreated += commits.length;
	// A phase (initializer/onboarding) iteration selects no feature, so its scaffold commit — which
	// legitimately creates every feature directory at once — would be discarded by the
	// feature-directory orphan guard in filterRunAttributedCommits (none of those directories are in
	// the run's attributed feature set). Mark these commits as genuine run work so they are always
	// attributed in the run ledger.
	if (work.kind === 'phase') {
		for (const commit of commits) acc.forcedAttributionCommits.add(commit.hash);
	}
	return [];
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
