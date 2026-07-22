// Per-run git worktree isolation. When a run executes in a worktree, the agent's edits,
// commits, and `.aidd/` metadata writes land on a throwaway branch in a separate checkout —
// the live project tree is never touched until an explicit merge-back. This gives free
// rollback (discard the worktree) and is the foundation for concurrent runs per project.
//
// `projectDir` stays canonical: it is the merge target and the planning-mirror source.
// `runRepoDir(plan)` (aidd-shared/plan/types) returns the worktree dir when one is active.

import type { WorktreePlan } from 'aidd-shared/plan/types';

import { removeTempTree } from 'aidd-shared/lib/remove-temp-tree';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MergeConflictResolver } from './merge-resolver.ts';

import { gitOutput, gitSuccess, readGitHead } from './git-exec.ts';

// Per-iteration restore points live under a run-scoped ref namespace in the shared object store
// (not the worktree's index), so they survive worktree removal until explicitly pruned.
function checkpointNamespace(worktree: WorktreePlan): string {
	const id = worktree.branch.startsWith('aidd/run-')
		? worktree.branch.slice('aidd/run-'.length)
		: worktree.branch.replaceAll('/', '-');
	return `refs/aidd-checkpoints/${id}`;
}

export interface CreateRunWorktreeOptions {
	/** Parent directory the per-run worktree is created under. Defaults to a temp dir.
	 * Web runs pass `<web.dataDir>/worktrees` so the worktree shares the run's data root. */
	baseDir?: string;
}

/** Create an isolated worktree for a run, branched off the project's current HEAD.
 *
 * Returns `null` when the project has no resolvable HEAD (a fresh `git init` with no commits,
 * i.e. the initializer phase) — worktree isolation is meaningless there, so the caller falls
 * back to running against the live tree. */
export async function createRunWorktree(
	projectDir: string,
	runId: string,
	options: CreateRunWorktreeOptions = {}
): Promise<null | WorktreePlan> {
	const baseSha = await readGitHead(projectDir);
	if (baseSha === undefined) return null;

	const parent = options.baseDir ?? join(tmpdir(), 'aidd-worktrees');
	await mkdir(parent, { recursive: true });
	const dir = join(parent, runId);
	const branch = `aidd/run-${runId}`;

	// Pin the worktree to an explicit SHA (not a moving ref) via --detach, then create the
	// run branch inside it. This avoids the "branch already checked out" failure class and
	// makes the base unambiguous for merge-base and rollback.
	if (!(await gitSuccess(projectDir, ['worktree', 'add', '--detach', dir, baseSha]))) {
		return null;
	}
	if (!(await gitSuccess(dir, ['switch', '-c', branch]))) {
		await gitSuccess(projectDir, ['worktree', 'remove', '--force', dir]);
		return null;
	}
	// Disable auto-gc in the worktree so a sibling run's gc can't prune our in-flight objects.
	await gitSuccess(dir, ['config', 'gc.auto', '0']);
	return { baseSha, branch, dir };
}

/** Record a restorable per-iteration checkpoint at the worktree's current HEAD. Lightweight
 * (an O(1) ref update); the namespace is pruned at teardown. Best-effort. */
export async function recordIterationCheckpoint(
	worktree: WorktreePlan,
	iteration: number
): Promise<void> {
	await gitSuccess(worktree.dir, [
		'update-ref',
		`${checkpointNamespace(worktree)}/iter-${iteration}`,
		'HEAD',
	]);
}

/** Tear down a run's worktree, its branch, and its checkpoint refs. Always force-removes (the
 * agent's editors may leave lock files); the directory removal then retries through the
 * EBUSY-aware remover since `git worktree remove` itself can fail while a child still holds a
 * handle on Windows. Best-effort: failures are swallowed so teardown never fails a run. */
export async function removeRunWorktree(projectDir: string, worktree: WorktreePlan): Promise<void> {
	await gitSuccess(projectDir, ['worktree', 'remove', '--force', worktree.dir]);
	// Belt-and-suspenders: clear any residue git left behind under EBUSY.
	await removeTempTree(worktree.dir).catch(() => {});
	await gitSuccess(projectDir, ['branch', '-D', worktree.branch]);
	// Prune checkpoint refs so a discarded (rolled-back) run leaves nothing keeping its commits
	// reachable; on a merged run the commits are already reachable from the project branch.
	const namespace = checkpointNamespace(worktree);
	const refs =
		(await gitOutput(projectDir, ['for-each-ref', '--format=%(refname)', namespace])) ?? '';
	for (const ref of refs
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)) {
		await gitSuccess(projectDir, ['update-ref', '-d', ref]);
	}
	await gitSuccess(projectDir, ['worktree', 'prune']);
}

export type MergeBackStatus = 'blocked' | 'conflict' | 'merged' | 'noop';

export interface MergeBackResult {
	status: MergeBackStatus;
}

/** Merge a run's worktree branch back into the project branch.
 *
 * - `noop`     — the branch never advanced past its base (nothing to merge).
 * - `blocked`  — the live project tree is dirty; merging is skipped to protect operator work.
 * - `merged`   — fast-forwarded, a clean `--no-ff` merge, or an AI-resolved conflict.
 * - `conflict` — a real merge conflict that wasn't resolved; the merge is aborted and the branch
 *                is left intact for manual resolution (the caller parks the run, exit 77).
 *
 * An optional `resolveConflict` callback gets a chance to resolve an in-progress conflict before
 * it's aborted. Always merges, never rebases/squashes — the run ledger records commit SHAs on the
 * worktree branch and a rebase would make them unreachable. */
export async function mergeRunBack(
	projectDir: string,
	worktree: WorktreePlan,
	resolveConflict?: MergeConflictResolver
): Promise<MergeBackResult> {
	const tip = (await gitOutput(worktree.dir, ['rev-parse', '--verify', 'HEAD']))?.trim();
	if (!tip || tip === worktree.baseSha) return { status: 'noop' };

	// A clean live tree means no tracked changes AND no non-ignored untracked files — an
	// untracked operator file the merge would create still counts as dirty and must block.
	const status = await gitOutput(projectDir, [
		'status',
		'--porcelain=v1',
		'--untracked-files=normal',
	]);
	if (status === undefined || status.trim() !== '') return { status: 'blocked' };

	if (await gitSuccess(projectDir, ['merge', '--ff-only', worktree.branch])) {
		return { status: 'merged' };
	}
	if (await gitSuccess(projectDir, ['merge', '--no-ff', '--no-edit', worktree.branch])) {
		return { status: 'merged' };
	}
	// Conflict: the merge is now in progress. Give the AI resolver a chance before parking.
	if (resolveConflict && (await resolveConflict(projectDir, worktree.branch))) {
		return { status: 'merged' };
	}
	await gitSuccess(projectDir, ['merge', '--abort']);
	return { status: 'conflict' };
}

/** Decide a finished run's worktree fate and return an exit-code OVERRIDE for the caller:
 *
 * - `undefined` — keep the orchestrator's own exit code. A failed run discards the worktree
 *   (free rollback, live tree untouched); a successful run that merges/noops removes it.
 * - `mergeConflictParked` (77) — a successful run whose merge-back was blocked (dirty live tree)
 *   or conflicted: the branch + worktree are PRESERVED for manual resolution, and the caller must
 *   surface a non-success code so nothing reports "done" when nothing reached the live tree.
 */
export async function reconcileRunWorktree(
	projectDir: string,
	worktree: WorktreePlan,
	exitCode: number,
	resolveConflict?: MergeConflictResolver
): Promise<number | undefined> {
	if (exitCode !== orchestratorExitCodes.success) {
		await removeRunWorktree(projectDir, worktree);
		console.log(
			`[worktree] run failed (exit ${exitCode}); discarded worktree ${worktree.branch} (live tree untouched).`
		);
		return undefined;
	}
	const merge = await mergeRunBack(projectDir, worktree, resolveConflict);
	if (merge.status === 'merged' || merge.status === 'noop') {
		await removeRunWorktree(projectDir, worktree);
		console.log(`[worktree] merge-back ${merge.status}; removed worktree ${worktree.branch}.`);
		return undefined;
	}
	console.warn(
		`[worktree] merge-back ${merge.status}; preserved branch ${worktree.branch} at ${worktree.dir} ` +
			`for manual resolution (exit ${orchestratorExitCodes.mergeConflictParked}).`
	);
	return orchestratorExitCodes.mergeConflictParked;
}
