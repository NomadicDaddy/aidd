import type { RunPlan } from 'aidd-shared/plan/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';

import type { MoveFn, OrchestratorDeps, RunAccumulator } from './types.ts';

import { writeRunSummary } from './artifacts.ts';
import { captureWriteGuardSnapshot, type WriteGuardSnapshot } from './write-allowlist.ts';

export type WriteGuardBaselineOutcome =
	{ baseline: null | WriteGuardSnapshot; kind: 'proceed' } | { exitCode: number; kind: 'return' };

/**
 * The write guard's baseline for this iteration: null when the run has no allowlist. When it has
 * one and git cannot describe the tree (not a repository, or status failed), the run ends here
 * with the violation code. A guard the operator asked for used to fail open with one console line
 * and run the iteration unguarded; the backend has not started yet, so refusing costs nothing.
 * Covers triumvirate too: its execution stage writes to the real worktree.
 */
export async function captureIterationWriteGuardBaseline(input: {
	acc: RunAccumulator;
	deps: OrchestratorDeps;
	move: MoveFn;
	plan: RunPlan;
}): Promise<WriteGuardBaselineOutcome> {
	if (input.plan.writeAllowlist === undefined) return { baseline: null, kind: 'proceed' };
	const baseline = await captureWriteGuardSnapshot(runRepoDir(input.plan));
	if (baseline !== null) return { baseline, kind: 'proceed' };
	const summary =
		'write allowlist cannot be enforced (git status failed or the project is not a git repository); refusing to run unguarded';
	// Still in compile_prompt: the run failed its precondition rather than finishing, and `failed`
	// is the legal move from there.
	input.move({ error: new Error(summary), type: 'failed' });
	console.error(summary);
	const exitCode = await writeRunSummary(
		input.deps,
		input.plan,
		input.acc,
		'exit_error',
		orchestratorExitCodes.writeAllowlistViolation,
		summary,
	);
	return { exitCode, kind: 'return' };
}
