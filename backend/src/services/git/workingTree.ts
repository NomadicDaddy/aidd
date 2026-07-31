import { statOrNull } from '../fsHelpers.ts';
import { runGit } from './runGit.ts';

// Per-file working-tree listing behind the Repository tab's dirty-file manager. `status.ts` answers
// "how dirty is this project" in aggregate for the fleet badges; this module answers "which files,
// and in what state" for a single project so the UI can stage/discard/commit individual entries.
//
// Read with `--porcelain=v1 -z`: NUL-terminated records mean paths with spaces, quotes, or newlines
// arrive intact instead of being backslash-quoted, and `core.quotepath=false` keeps non-ASCII paths
// readable. That matters because the mutation routes match requested paths against this listing.

const commandTimeoutMs = 5_000;
const maxFiles = 2_000;

export type WorkingTreeState = 'error' | 'not-a-repo' | 'ok' | 'project-missing';

export interface WorkingTreeFile {
	/** True when the entry is an unresolved merge conflict; it can be staged but not discarded. */
	conflicted: boolean;
	/** Index-side porcelain letter (`M`, `A`, `D`, `R`, …), or `' '` when the index matches HEAD. */
	indexStatus: string;
	/** Pre-rename path for a rename/copy entry, else null. */
	origPath: null | string;
	/** Repository-relative path, forward-slashed, exactly as git reported it. */
	path: string;
	/** True when the index differs from HEAD for this path. */
	staged: boolean;
	/** True when the working tree differs from the index for this path. */
	unstaged: boolean;
	/** True when git does not track this path at all. */
	untracked: boolean;
	/** Worktree-side porcelain letter, or `' '` when the working tree matches the index. */
	worktreeStatus: string;
}

export interface WorkingTreeResult {
	files: WorkingTreeFile[];
	reason: null | string;
	state: WorkingTreeState;
	/** True when the listing was capped at the server's file budget. */
	truncated: boolean;
}

const conflictStatuses = new Set(['AA', 'AU', 'DD', 'DU', 'UA', 'UD', 'UU']);

function isDirty(letter: string | undefined): boolean {
	return Boolean(letter) && letter !== ' ' && letter !== '!' && letter !== '?';
}

/**
 * Parse `git status --porcelain=v1 -z` output; renames emit the new path first, then the old.
 * @param stdout
 * @returns The parsed entries plus whether the file budget was hit.
 */
export function parseWorkingTreeStatus(stdout: string): {
	files: WorkingTreeFile[];
	truncated: boolean;
} {
	const records = stdout.split('\0');
	const files: WorkingTreeFile[] = [];
	let truncated = false;
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		// The trailing NUL yields a final empty record; short records cannot carry `XY ` + a path.
		if (!record || record.length < 4) continue;
		const status = record.slice(0, 2);
		const path = record.slice(3);
		const indexStatus = status[0] ?? ' ';
		const worktreeStatus = status[1] ?? ' ';
		// A rename/copy record is followed by its own NUL-terminated pre-rename path.
		const renamed = indexStatus === 'C' || indexStatus === 'R';
		const origPath = renamed ? (records[index + 1] ?? null) : null;
		if (renamed) index += 1;
		if (files.length >= maxFiles) {
			truncated = true;
			break;
		}
		const untracked = status === '??';
		files.push({
			conflicted: conflictStatuses.has(status),
			indexStatus,
			origPath,
			path,
			staged: !untracked && isDirty(indexStatus),
			unstaged: !untracked && isDirty(worktreeStatus),
			untracked,
			worktreeStatus,
		});
	}
	return { files, truncated };
}

function failure(state: Exclude<WorkingTreeState, 'ok'>, reason: string): WorkingTreeResult {
	return { files: [], reason, state, truncated: false };
}

/**
 * List every changed path in the project's working tree. Paths are limited to `?` pathspecs when
 * `paths` is given, which the mutation flow uses to re-read only the entries it just touched.
 * @param projectPath
 * @param paths
 * @returns The listing, or a non-`ok` state with a reason.
 */
export async function readWorkingTree(
	projectPath: string,
	paths?: string[],
): Promise<WorkingTreeResult> {
	const dirStat = await statOrNull(projectPath);
	if (!dirStat?.isDirectory()) return failure('project-missing', 'Project directory is missing.');
	const scope = paths && paths.length > 0 ? ['--', ...paths] : [];
	const output = await runGit(
		projectPath,
		[
			'-c',
			'core.quotepath=false',
			// Without this, a scoped read treats each path as a pathspec pattern: a file literally
			// named `[ab].txt` also matches `a.txt`, so the discard flow would widen from the file
			// the user picked to files they never selected.
			'--literal-pathspecs',
			'status',
			'--porcelain=v1',
			'-z',
			'--untracked-files=all',
			...scope,
		],
		commandTimeoutMs,
	);
	if (!output.ok) {
		if (/not a git repository/i.test(output.stderr)) {
			return failure('not-a-repo', 'This project directory is not a git repository.');
		}
		return failure('error', output.timedOut ? 'git status timed out.' : 'git status failed.');
	}
	const { files, truncated } = parseWorkingTreeStatus(output.stdout);
	return { files, reason: null, state: 'ok', truncated };
}
