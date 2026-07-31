import type { WorkingTreeActionResult } from './workingTreeActions.ts';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
import { gitFailureReason, type GitOutput, runGit } from './runGit.ts';
import { readWorkingTree, type WorkingTreeResult } from './workingTree.ts';
import { resolveWorkingTreeSelection } from './workingTreeSelection.ts';

// Commit halves of the Repository tab's dirty-file manager: commit exactly the selected paths, or
// commit whatever is already staged.
//
// Commit hooks are deliberately left enabled — this repository's own leak guard runs as one — so
// the timeout is generous compared with the other working-tree commands.

const commitTimeoutMs = 60_000;

export const commitMessageMaxLength = 2_000;

async function git(projectDir: string, args: string[]): Promise<GitOutput> {
	return await runGit(projectDir, ['--literal-pathspecs', ...args], commitTimeoutMs);
}

async function settle(
	projectDir: string,
	operation: string,
	fileCount: number,
	reason: null | string,
): Promise<WorkingTreeActionResult> {
	recordDataMovement({
		category: 'file',
		operation: `project.working-tree.${operation}`,
		status: reason ? 'error' : 'success',
		summary: { fileCount },
		target: projectDir,
	});
	const after: WorkingTreeResult = await readWorkingTree(projectDir);
	return { after, ok: reason === null, reason };
}

function requireMessage(message: string): string {
	const trimmed = message.trim();
	if (trimmed.length === 0) throw new HttpError('A commit message is required.', 400);
	return trimmed;
}

/**
 * Stage the selected paths and commit exactly those paths. The commit is path-scoped
 * (`commit -- <paths>`) so anything else already sitting in the index stays staged.
 * @param projectDir
 * @param paths
 * @param message
 * @returns The refreshed listing plus whether git accepted the command.
 */
export async function commitWorkingTreePaths(
	projectDir: string,
	paths: string[],
	message: string,
): Promise<WorkingTreeActionResult> {
	const trimmed = requireMessage(message);
	const { entries, pathspecs } = await resolveWorkingTreeSelection(projectDir, paths);
	const conflicted = entries.filter((entry) => entry.conflicted);
	if (conflicted.length > 0) {
		throw new HttpError(
			`Resolve the merge conflict in ${conflicted[0]?.path} before committing it.`,
			409,
		);
	}

	const add = await git(projectDir, ['add', '--all', '--', ...pathspecs]);
	if (!add.ok) {
		return await settle(
			projectDir,
			'commit',
			paths.length,
			gitFailureReason(add, 'git add failed.'),
		);
	}
	const commit = await git(projectDir, ['commit', '--message', trimmed, '--', ...pathspecs]);
	const reason = commit.ok ? null : gitFailureReason(commit, 'git commit failed.');
	return await settle(projectDir, 'commit', paths.length, reason);
}

/**
 * Commit whatever is already in the index, leaving unstaged edits in the working tree.
 * @param projectDir
 * @param message
 * @returns The refreshed listing plus whether git accepted the command.
 */
export async function commitStagedWorkingTree(
	projectDir: string,
	message: string,
): Promise<WorkingTreeActionResult> {
	const trimmed = requireMessage(message);
	const tree = await readWorkingTree(projectDir);
	if (tree.state !== 'ok') {
		throw new HttpError(tree.reason ?? 'The working tree could not be read.', 409);
	}
	const staged = tree.files.filter((file) => file.staged);
	if (staged.length === 0) throw new HttpError('Nothing is staged to commit.', 409);

	const commit = await git(projectDir, ['commit', '--message', trimmed]);
	const reason = commit.ok ? null : gitFailureReason(commit, 'git commit failed.');
	return await settle(projectDir, 'commit-staged', staged.length, reason);
}
