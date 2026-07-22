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
		summary
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
		summary
	);
}
