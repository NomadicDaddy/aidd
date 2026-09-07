import type { RunPlan } from 'aidd-shared/plan/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { wallClockTimeoutMarker } from 'aidd-shared/runs/outcome';

import type { MoveFn, OrchestratorDeps, RunAccumulator } from './types.ts';

import { writeRunSummary } from './artifacts.ts';

function formatWallClockBudget(budgetMs: number): string {
	const minutes = Math.round(budgetMs / 60000);
	return minutes >= 120
		? `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)}h`
		: `${minutes}m`;
}

export function wallClockDeadlineMs(plan: RunPlan, runStartedAtMs: number): number {
	return runStartedAtMs + plan.outputPolicy.timeoutSeconds * 1000;
}

export function buildWallClockTimeoutSummary(baseSummary: string, plan: RunPlan): string {
	const budgetMs = plan.outputPolicy.timeoutSeconds * 1000;
	return `${baseSummary}; ${wallClockTimeoutMarker} run exceeded the ${formatWallClockBudget(budgetMs)} wall-clock budget (timeoutSeconds=${plan.outputPolicy.timeoutSeconds})`;
}

// Loop-top guard: iteration paths that bypass the continuation gate (rate-limit retry,
// continuable backend interruption) can re-enter the orchestrator loop after the wall-clock
// deadline has passed. Without this the run claims work, writes a started artifact, and
// spawns a backend that the wall-clock watchdog kills at startup — wasted spend and a dirty
// worktree. Returns the final exit code when the run must end, undefined to proceed.
export async function endRunIfWallClockExpired(input: {
	acc: RunAccumulator;
	deps: OrchestratorDeps;
	lastSummary: string;
	move: MoveFn;
	plan: RunPlan;
	runStartedAtMs: number;
}): Promise<number | undefined> {
	if (Date.now() < wallClockDeadlineMs(input.plan, input.runStartedAtMs)) return undefined;
	const summary = buildWallClockTimeoutSummary(input.lastSummary, input.plan);
	input.move({ summary, type: 'complete' });
	console.log(summary);
	return await writeRunSummary(
		input.deps,
		input.plan,
		input.acc,
		'exit_error',
		orchestratorExitCodes.aborted,
		summary,
	);
}

// An iteration dispatched with only minutes of budget left cannot finish: the agent reads the
// project, starts work, and the wall-clock watchdog kills it mid-edit — burning spend, leaving a
// dirty worktree, and ending the run on an abort instead of a clean stop. Estimate the next
// iteration's cost from the median of the ones already observed and refuse to start one that
// cannot land. Median rather than mean so a single pathological iteration does not shut the run
// down early. The estimate is deliberately NOT capped as a fraction of the budget: a cap is
// exactly wrong for the long-iteration case it looks like it protects (a 20-minute iteration
// under a 25%-of-60-minute cap estimates 15 minutes, so the guard waves through an iteration
// with 17 minutes left that then dies mid-edit), and the degenerate case it was meant to catch —
// an estimate exceeding the whole budget — cannot be reached without the deadline having already
// passed, which endRunIfWallClockExpired handles first.
const MIN_OBSERVED_ITERATIONS_FOR_ESTIMATE = 2;

function medianMs(values: readonly number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
	return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Milliseconds the next iteration is expected to need, or undefined when too few iterations have
 * finished to estimate from. */
export function estimatedIterationCostMs(acc: RunAccumulator, plan: RunPlan): number | undefined {
	if (acc.iterationDurationsMs.length < MIN_OBSERVED_ITERATIONS_FOR_ESTIMATE) return undefined;
	if (plan.outputPolicy.timeoutSeconds <= 0) return undefined;
	return medianMs(acc.iterationDurationsMs);
}

/** Loop-top guard: end the run cleanly when too little wall-clock budget remains to complete
 * another iteration. Returns the final exit code when the run must end, undefined to proceed.
 * Distinct from endRunIfWallClockExpired, which handles a deadline that has already passed and so
 * ends in `exit_error`/aborted; this one stops *before* wasting an iteration and therefore reports
 * a successful, deliberate stop. */
export async function endRunIfBudgetTooThinForIteration(input: {
	acc: RunAccumulator;
	deps: OrchestratorDeps;
	lastSummary: string;
	move: MoveFn;
	plan: RunPlan;
	runStartedAtMs: number;
}): Promise<number | undefined> {
	const estimateMs = estimatedIterationCostMs(input.acc, input.plan);
	if (estimateMs === undefined) return undefined;
	const remainingMs = wallClockDeadlineMs(input.plan, input.runStartedAtMs) - Date.now();
	if (remainingMs >= estimateMs) return undefined;
	// runTotals.iterations counts the iterations that finished; the one being declined is the next.
	const declinedIteration = input.acc.runTotals.iterations + 1;
	const summary =
		`${input.lastSummary}; stopped before iteration ${declinedIteration}: ` +
		`${formatWallClockBudget(remainingMs)} of the ${formatWallClockBudget(input.plan.outputPolicy.timeoutSeconds * 1000)} ` +
		`wall-clock budget remained, below the ${formatWallClockBudget(estimateMs)} this run's ` +
		`iterations have been taking (timeoutSeconds=${input.plan.outputPolicy.timeoutSeconds})`;
	input.move({ summary, type: 'complete' });
	console.log(summary);
	return await writeRunSummary(
		input.deps,
		input.plan,
		input.acc,
		'wall_clock_budget',
		orchestratorExitCodes.success,
		summary,
	);
}

export async function finalizeMaxIterationsRun(input: {
	acc: RunAccumulator;
	deps: OrchestratorDeps;
	lastSummary: string;
	move: MoveFn;
	plan: RunPlan;
}): Promise<number> {
	const summary = `${input.lastSummary}; max iterations reached (${input.plan.scope.maxIterations ?? 'unlimited'})`;
	input.move({ summary, type: 'complete' });
	console.log(summary);
	return await writeRunSummary(
		input.deps,
		input.plan,
		input.acc,
		'max_iterations',
		orchestratorExitCodes.success,
		summary,
	);
}

/** How many selections in a row may vanish before the run is ended rather than reselecting again.
 * Selection reads the store fresh, so a deleted record cannot legitimately come back; this bounds
 * a store that keeps returning one instead of letting the loop spin. */
const maxConsecutiveVanishedClaims = 3;

/** A selected feature's record was deleted between selection and the claim (a concurrent
 * consolidation or prune). Dispatching now would point an agent at a directory that no longer holds
 * a spec, so the loop reselects — and a skipped iteration must not count against maxIterations.
 * Returns `undefined` to keep reselecting, or the exit code that ends the run when it keeps
 * happening. */
export async function endRunIfClaimsKeepVanishing(input: {
	acc: RunAccumulator;
	consecutiveVanishedClaims: number;
	deps: OrchestratorDeps;
	featureId: string | undefined;
	move: MoveFn;
	plan: RunPlan;
}): Promise<number | undefined> {
	const { acc, consecutiveVanishedClaims, deps, featureId, move, plan } = input;
	console.warn(
		`[feature-scope] selected feature '${featureId}' was deleted before this iteration could start (concurrent run); reselecting`,
	);
	if (consecutiveVanishedClaims < maxConsecutiveVanishedClaims) return undefined;
	const summary = `selection kept returning feature records that were deleted before the iteration could start (${consecutiveVanishedClaims} in a row); last: ${featureId}`;
	move({ summary, type: 'complete' });
	console.error(summary);
	return await writeRunSummary(
		deps,
		plan,
		acc,
		'blocked',
		orchestratorExitCodes.validationError,
		summary,
	);
}
