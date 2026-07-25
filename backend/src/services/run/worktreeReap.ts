import { removeTempTree } from 'aidd-shared/lib/remove-temp-tree';

import { webLogger } from '../../logger.ts';

async function gitOk(cwd: string, args: string[]): Promise<boolean> {
	const proc = Bun.spawn(['git', '-C', cwd, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	return (await proc.exited) === 0;
}

/**
 * Reap a run's git worktree + branch from the backend (no CLI involved). Used by the orphan
 * sweeper when a run's supervising process died without cleaning up its own worktree (e.g. a
 * web restart killed a detached run on Windows). Best-effort: a worktree the CLI already removed
 * makes `git worktree remove` fail harmlessly. Only call this for ORPHANED runs — gracefully
 * parked runs (merge conflict, exit 77) preserve their worktree intentionally and are never swept.
 * @param projectPath
 * @param worktreePath
 * @param worktreeBranch
 */
export async function reapRunWorktree(
	projectPath: string,
	worktreePath: string,
	worktreeBranch: null | string,
): Promise<void> {
	try {
		await gitOk(projectPath, ['worktree', 'remove', '--force', worktreePath]);
		await removeTempTree(worktreePath).catch(() => {});
		if (worktreeBranch) await gitOk(projectPath, ['branch', '-D', worktreeBranch]);
		await gitOk(projectPath, ['worktree', 'prune']);
		webLogger.warn({ branch: worktreeBranch, worktreePath }, 'Reaped orphaned run worktree');
	} catch (err) {
		webLogger.warn({ err, worktreePath }, 'Failed to reap orphaned run worktree');
	}
}
