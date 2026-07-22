import { recordDataMovement } from '../dataMovementTrace.ts';

export interface CommitFilesResult {
	committed: boolean;
	reason?: string;
}

// Bun.spawn (never node:child_process) — on Windows the latter leaks the HTTP listen socket into
// the child and orphans the port. Argv array means no shell interpolation of the paths/message.
async function gitSuccess(projectDir: string, args: string[]): Promise<boolean> {
	const proc = Bun.spawn(['git', '-C', projectDir, ...args], {
		stderr: 'pipe',
		stdin: 'ignore',
		stdout: 'pipe',
		windowsHide: true,
	});
	return (await proc.exited) === 0;
}

async function isInsideWorkTree(projectDir: string): Promise<boolean> {
	return gitSuccess(projectDir, ['rev-parse', '--is-inside-work-tree']);
}

// Stage and commit exactly `paths` as one bundle. The commit is path-scoped (`commit -- <paths>`)
// so unrelated working-tree changes never get swept into it. Best-effort: every failure mode
// (not a repo, nothing to commit, add/commit failure) returns a reason instead of throwing — the
// feature.json + roadmap.json are already on disk, so a failed auto-commit must not fail the
// originating request.
export async function commitFiles(
	projectDir: string,
	paths: string[],
	message: string
): Promise<CommitFilesResult> {
	if (paths.length === 0) return { committed: false, reason: 'no-paths' };

	const trace = (status: string, reason?: string): void => {
		recordDataMovement({
			category: 'file',
			operation: 'report.commit',
			status,
			summary: { fileCount: paths.length, ...(reason ? { reason } : {}) },
			target: projectDir,
		});
	};

	if (!(await isInsideWorkTree(projectDir))) {
		trace('skip', 'not-a-repo');
		return { committed: false, reason: 'not-a-repo' };
	}

	if (!(await gitSuccess(projectDir, ['add', '--', ...paths]))) {
		trace('error', 'add-failed');
		return { committed: false, reason: 'add-failed' };
	}

	// `git diff --cached --quiet -- <paths>` exits non-zero when there are staged changes for the
	// given paths. If it exits 0 there is nothing to commit (e.g. a re-submit that produced an
	// identical feature.json) — treat that as a benign no-op rather than a failed commit.
	const hasStagedChanges = !(await gitSuccess(projectDir, [
		'diff',
		'--cached',
		'--quiet',
		'--',
		...paths,
	]));
	if (!hasStagedChanges) {
		trace('skip', 'nothing-to-commit');
		return { committed: false, reason: 'nothing-to-commit' };
	}

	if (!(await gitSuccess(projectDir, ['commit', '-m', message, '--', ...paths]))) {
		trace('error', 'commit-failed');
		return { committed: false, reason: 'commit-failed' };
	}

	trace('success');
	return { committed: true };
}
