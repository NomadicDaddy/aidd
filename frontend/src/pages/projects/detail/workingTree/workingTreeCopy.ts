import type { WorkingTreeFile, WorkingTreeState } from '../../../../api/types.ts';

export const STATE_MESSAGE: Record<WorkingTreeState, string> = {
	error: 'The working tree could not be read. Git may be unavailable or the read timed out.',
	'not-a-repo':
		'This project directory is not a git repository, so there are no changes to manage.',
	ok: '',
	'project-missing': 'The project directory no longer exists on disk.',
};

/**
 * Discard is the one irreversible action here, so the confirmation names what is actually at stake:
 * tracked files revert to HEAD and can be recovered from git, untracked files are deleted outright
 * and cannot.
 */
export function describeDiscard(files: WorkingTreeFile[]): string {
	const untracked = files.filter((file) => file.untracked).length;
	const tracked = files.length - untracked;
	const parts: string[] = [];
	if (tracked > 0) {
		parts.push(
			`${tracked} tracked file${tracked === 1 ? '' : 's'} will be reverted to the last commit`,
		);
	}
	if (untracked > 0) {
		parts.push(
			`${untracked} untracked file${untracked === 1 ? '' : 's'} will be deleted from disk`,
		);
	}
	return `${parts.join(', and ')}. This cannot be undone.`;
}
