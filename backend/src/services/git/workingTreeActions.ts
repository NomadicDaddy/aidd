import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
import { gitFailureReason, type GitOutput, runGit } from './runGit.ts';
import { readWorkingTree, type WorkingTreeResult } from './workingTree.ts';
import { resolveWorkingTreeSelection } from './workingTreeSelection.ts';

// Stage / unstage / discard / reset for the Repository tab's dirty-file manager. Commit lives in
// workingTreeCommit.ts.
//
// `--literal-pathspecs` on every mutating command: paths come back out of `git status`, so a file
// genuinely named `:(glob)x` would otherwise be re-read as pathspec magic rather than as itself.

const commandTimeoutMs = 15_000;

export interface WorkingTreeActionResult {
	/** The listing after the action, so the client refreshes in the same round trip. */
	after: WorkingTreeResult;
	ok: boolean;
	reason: null | string;
}

function trace(projectDir: string, operation: string, status: string, fileCount: number): void {
	recordDataMovement({
		category: 'file',
		operation: `project.working-tree.${operation}`,
		status,
		summary: { fileCount },
		target: projectDir,
	});
}

async function settle(
	projectDir: string,
	operation: string,
	fileCount: number,
	reason: null | string,
): Promise<WorkingTreeActionResult> {
	trace(projectDir, operation, reason ? 'error' : 'success', fileCount);
	return { after: await readWorkingTree(projectDir), ok: reason === null, reason };
}

async function git(projectDir: string, args: string[]): Promise<GitOutput> {
	return await runGit(projectDir, ['--literal-pathspecs', ...args], commandTimeoutMs);
}

/**
 * `git add` the selected paths. Also stages deletions and previously untracked files.
 * @param projectDir
 * @param paths
 * @returns The refreshed listing plus whether git accepted the command.
 */
export async function stageWorkingTreePaths(
	projectDir: string,
	paths: string[],
): Promise<WorkingTreeActionResult> {
	const { pathspecs } = await resolveWorkingTreeSelection(projectDir, paths);
	const output = await git(projectDir, ['add', '--all', '--', ...pathspecs]);
	const reason = output.ok ? null : gitFailureReason(output, 'git add failed.');
	return await settle(projectDir, 'stage', paths.length, reason);
}

/**
 * `git reset` the selected paths back out of the index, leaving the working tree untouched.
 * @param projectDir
 * @param paths
 * @returns The refreshed listing plus whether git accepted the command.
 */
export async function unstageWorkingTreePaths(
	projectDir: string,
	paths: string[],
): Promise<WorkingTreeActionResult> {
	const { pathspecs } = await resolveWorkingTreeSelection(projectDir, paths);
	const output = await git(projectDir, ['reset', '--quiet', '--', ...pathspecs]);
	const reason = output.ok ? null : gitFailureReason(output, 'git reset failed.');
	return await settle(projectDir, 'unstage', paths.length, reason);
}

/**
 * `git reset` with no pathspec: unstage everything, keeping every edit in the working tree.
 * @param projectDir
 * @returns The refreshed listing plus whether git accepted the command.
 */
export async function resetWorkingTreeIndex(projectDir: string): Promise<WorkingTreeActionResult> {
	const tree = await readWorkingTree(projectDir);
	if (tree.state !== 'ok') {
		throw new HttpError(tree.reason ?? 'The working tree could not be read.', 409);
	}
	const staged = tree.files.filter((file) => file.staged).length;
	const output = await git(projectDir, ['reset', '--quiet']);
	const reason = output.ok ? null : gitFailureReason(output, 'git reset failed.');
	return await settle(projectDir, 'reset', staged, reason);
}

/**
 * Throw away every change to the selected paths.
 *
 * Done in three passes rather than one `git restore --source=HEAD --staged --worktree`, because
 * that form fails on paths absent from HEAD (a staged add, or the new half of a rename) and on an
 * unborn HEAD. Unstaging first collapses adds, renames, and staged modifications into plain
 * worktree states, and re-reading the status decides which of the two removal commands each path
 * now needs — so nothing has to be inferred from the pre-action status letters.
 * @param projectDir
 * @param paths
 * @returns The refreshed listing plus whether git accepted the command.
 */
export async function discardWorkingTreePaths(
	projectDir: string,
	paths: string[],
): Promise<WorkingTreeActionResult> {
	const { entries, pathspecs } = await resolveWorkingTreeSelection(projectDir, paths);
	const conflicted = entries.filter((entry) => entry.conflicted);
	if (conflicted.length > 0) {
		throw new HttpError(
			`Resolve the merge conflict in ${conflicted[0]?.path} before discarding it.`,
			409,
		);
	}

	const reset = await git(projectDir, ['reset', '--quiet', '--', ...pathspecs]);
	if (!reset.ok) {
		return await settle(
			projectDir,
			'discard',
			paths.length,
			gitFailureReason(reset, 'git reset failed.'),
		);
	}

	const scoped = await readWorkingTree(projectDir, pathspecs);
	if (scoped.state !== 'ok') {
		return await settle(projectDir, 'discard', paths.length, scoped.reason);
	}
	// The scoped read is already literal, but the removal commands below delete files, so the set is
	// narrowed to the selected paths by exact string match too — no filename can widen the blast
	// radius beyond what the user checked, whatever git decides a pathspec means.
	const selected = new Set(pathspecs);
	const removable = scoped.files.filter((file) => selected.has(file.path));
	const tracked = removable.filter((file) => !file.untracked).map((file) => file.path);
	const untracked = removable.filter((file) => file.untracked).map((file) => file.path);

	if (tracked.length > 0) {
		const restore = await git(projectDir, ['restore', '--worktree', '--', ...tracked]);
		if (!restore.ok) {
			const reason = gitFailureReason(restore, 'git restore failed.');
			return await settle(projectDir, 'discard', paths.length, reason);
		}
	}
	if (untracked.length > 0) {
		const clean = await git(projectDir, ['clean', '--force', '-d', '--', ...untracked]);
		if (!clean.ok) {
			const reason = gitFailureReason(clean, 'git clean failed.');
			return await settle(projectDir, 'discard', paths.length, reason);
		}
	}
	return await settle(projectDir, 'discard', paths.length, null);
}
