import type { WorkingTreeFile } from '../../../../api/types.ts';
import type { Tone } from '../../../../lib/tones.ts';

// Porcelain v1 status letters, rendered as words. Index and worktree sides are described
// separately because a file can be both (e.g. `MM` — staged edits plus newer unstaged ones).

// Mirrors maxSelectedPaths in backend/src/services/git/workingTreeSelection.ts. The listing itself
// can run to 2,000 entries, so "select all" has to stop here rather than offer actions the route
// would reject.
export const maxSelectedPaths = 500;

const LETTERS: Record<string, string> = {
	A: 'Added',
	C: 'Copied',
	D: 'Deleted',
	M: 'Modified',
	R: 'Renamed',
	T: 'Type changed',
	U: 'Unmerged',
};

function describeLetter(letter: string): null | string {
	return LETTERS[letter] ?? null;
}

export interface WorkingTreeLabel {
	/** The full sentence used as the row's `title` tooltip. */
	detail: string;
	/** Short label for the status column. */
	label: string;
	tone: Tone;
}

export function describeWorkingTreeFile(file: WorkingTreeFile): WorkingTreeLabel {
	if (file.conflicted) {
		return {
			detail: 'Unresolved merge conflict. Resolve it before discarding or committing.',
			label: 'Conflicted',
			tone: 'red',
		};
	}
	if (file.untracked) {
		return {
			detail: 'Untracked — git does not track this file yet. Discarding deletes it from disk.',
			label: 'Untracked',
			tone: 'violet',
		};
	}
	const staged = file.staged ? describeLetter(file.indexStatus) : null;
	const unstaged = file.unstaged ? describeLetter(file.worktreeStatus) : null;
	const label =
		staged && unstaged && staged !== unstaged
			? `${staged} · ${unstaged}`
			: (staged ?? unstaged ?? 'Changed');
	const parts: string[] = [];
	if (staged) parts.push(`${staged} in the index`);
	if (unstaged) parts.push(`${unstaged} in the working tree`);
	if (file.origPath) parts.push(`was ${file.origPath}`);
	return {
		detail: parts.length > 0 ? `${parts.join(', ')}.` : 'Changed.',
		label,
		tone: file.staged && !file.unstaged ? 'emerald' : file.staged ? 'amber' : 'teal',
	};
}

/** Where a row sits in the stage/unstage flow, used to enable or disable the toolbar buttons. */
export function countSelection(files: WorkingTreeFile[]): {
	conflicted: number;
	staged: number;
	unstaged: number;
} {
	return {
		conflicted: files.filter((file) => file.conflicted).length,
		staged: files.filter((file) => file.staged).length,
		unstaged: files.filter((file) => file.unstaged || file.untracked).length,
	};
}
