// CLI-entrypoint wiring for worktree-isolated runs: create the throwaway checkout, seed its
// gitignored `.aidd` from the canonical store, build the orchestrator deps that route
// finalization and the run ledger, and roll back (evidence-first) on a thrown failure.
// Extracted from app.ts so the entrypoint stays a thin sequence of phases.

import type { AiddStore } from 'aidd-shared/metadata/store';
import type { RunPlan } from 'aidd-shared/plan/types';

import { join } from 'node:path';

import type { MergeConflictResolver } from './merge-resolver.ts';
import type { OrchestratorDeps } from './types.ts';
import type { WorktreeMetadataSession } from './worktree-metadata-session.ts';

import { finalizeRunWorktree, persistRunEvidence } from './worktree-evidence.ts';
import { createRunWorktree, removeRunWorktree } from './worktree-manager.ts';
import { seedWorktreeMetadata } from './worktree-metadata-session.ts';

export interface WorktreeRunContext {
	session: WorktreeMetadataSession;
}

/** Set up worktree isolation for a coding run when requested. On success the plan's `worktree`
 * is populated (so `runRepoDir(plan)` resolves to the checkout) and the seeded metadata session
 * is returned. Returns null when isolation was not requested, the mode is not coding, or the
 * project has no committed HEAD (initializer phase — falls back to the live tree with a warning).
 *
 * Seeding matters: `.aidd/` is gitignored in every supported profile, so the fresh checkout
 * contains NO project metadata. An unseeded worktree store lists zero features and the run ends
 * `no_work` (silent success) regardless of eligible work. Seeding failures throw to the caller,
 * whose rollback path preserves evidence and removes the worktree. */
export async function prepareWorktreeRun(input: {
	plan: RunPlan;
	requested: boolean;
	runId: string;
	webDataDir?: string;
}): Promise<null | WorktreeRunContext> {
	const { plan, requested, runId, webDataDir } = input;
	if (!requested || plan.mode !== 'coding') return null;
	const worktree = await createRunWorktree(plan.projectDir, runId, {
		...(webDataDir ? { baseDir: join(webDataDir, 'worktrees') } : {}),
	});
	if (worktree === null) {
		console.warn(
			'[worktree] --worktree requested but the project has no committed HEAD; running against the live tree.',
		);
		return null;
	}
	plan.worktree = worktree;
	console.log(`[worktree] run isolated in ${worktree.dir} on branch ${worktree.branch}`);
	const session = await seedWorktreeMetadata(plan.projectDir, worktree.dir);
	console.log(
		`[worktree] seeded ${session.seededFiles} metadata file(s) into the worktree store`,
	);
	return { session };
}

/** Orchestrator deps for a worktree run: finalization (evidence persistence + merge-back/park +
 * metadata write-back) runs INSIDE the orchestrator's terminal writeRunSummary via this hook —
 * before the ledger append and the run's heartbeat — so a parked merge surfaces as a
 * non-success exit code everywhere instead of the pre-merge success. The ledger goes to the
 * canonical store: the worktree's own gitignored `.aidd` dies with the worktree. */
export function worktreeOrchestratorDeps(
	plan: RunPlan,
	context: WorktreeRunContext,
	canonicalStore: AiddStore,
	resolveConflict: MergeConflictResolver,
): Pick<OrchestratorDeps, 'finalizeWorktree' | 'ledgerStore'> {
	const worktree = plan.worktree;
	if (!worktree) throw new Error('worktreeOrchestratorDeps requires plan.worktree');
	return {
		finalizeWorktree: (exitCode: number) =>
			finalizeRunWorktree({
				exitCode,
				projectDir: plan.projectDir,
				resolveConflict,
				session: context.session,
				worktree,
			}),
		ledgerStore: canonicalStore,
	};
}

/** Rollback for a thrown run failure that never reached merge-back: preserve any iteration
 * evidence the run managed to write, then discard the worktree so the run rolls back instead
 * of leaking a branch + checkout. Best-effort on both steps.
 *
 * Covers THROWN errors only. A hard process death (unhandled rejection / uncaught exception)
 * never reaches this path: its evidence is lost with the checkout (accepted — the crash
 * finalizer still writes a canonical failed ledger line) and the web orphan sweeper reaps the
 * leftover worktree. See the crash-finalizer comment in app.ts. */
export async function rollbackWorktreeRun(plan: RunPlan): Promise<void> {
	const worktree = plan.worktree;
	if (!worktree) return;
	try {
		await persistRunEvidence(plan.projectDir, worktree.dir);
	} catch (err) {
		// The worktree holds the only copy of the run's logs: when persisting them fails,
		// preserve the checkout instead of discarding it.
		console.warn(
			`[worktree] evidence persistence FAILED during rollback (${err instanceof Error ? err.message : String(err)}); ` +
				`preserving worktree ${worktree.dir} — recover its .aidd/iterations manually.`,
		);
		return;
	}
	await removeRunWorktree(plan.projectDir, worktree).catch(() => {});
}
