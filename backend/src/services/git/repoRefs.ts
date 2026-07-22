import { statOrNull } from '../fsHelpers.ts';

// Branch, stash, and worktree introspection for the Repository tab. Split from repoStats.ts so the
// stats module stays under the 300-line ceiling while this module owns its own git command group.
//
// Each command is bounded with its own timeout (same pattern as repoStats). The branch list is
// capped at maxBranches, stashes at maxStashes, and worktrees at maxWorktrees so a repository with
// hundreds of branches/stashes never blocks the UI or floods the response.

const commandTimeoutMs = 5_000;
const maxBranches = 50;
const maxStashes = 20;
const maxWorktrees = 20;

export interface RepositoryBranch {
	/** True when this is the currently checked-out branch. */
	current: boolean;
	/** Branch name, e.g. `main`, `feature/x`. */
	name: string;
	/** Upstream tracking ref, e.g. `origin/main`, or null when untracked. */
	upstream: null | string;
}

export interface RepositoryStash {
	/** Stash index as shown by `git stash list`, starting at 0. */
	index: number;
	/** Short SHA of the stash commit. */
	sha: string;
	/** One-line description, e.g. `WIP on main: abc1234 feat: seed`. */
	subject: string;
}

export interface RepositoryWorktree {
	/** Branch checked out in the worktree, or `(detached HEAD)` when detached. */
	branch: string;
	/** True when this is the main worktree (the repository root). */
	main: boolean;
	/** Absolute path to the worktree directory. */
	path: string;
}

export interface RepositoryRefs {
	branches: RepositoryBranch[];
	stashes: RepositoryStash[];
	worktrees: RepositoryWorktree[];
}

export type RepositoryRefsState = 'error' | 'not-a-repo' | 'ok' | 'project-missing';

export interface RepositoryRefsResult {
	reason: null | string;
	refs: null | RepositoryRefs;
	state: RepositoryRefsState;
}

interface GitOutput {
	ok: boolean;
	stderr: string;
	stdout: string;
	timedOut: boolean;
}

async function runGit(cwd: string, args: string[], timeoutMs: number): Promise<GitOutput> {
	let subprocess: ReturnType<typeof Bun.spawn>;
	try {
		subprocess = Bun.spawn(['git', ...args], {
			cwd,
			stderr: 'pipe',
			stdin: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});
	} catch (err) {
		const stderr = err instanceof Error ? err.message : String(err);
		return { ok: false, stderr, stdout: '', timedOut: false };
	}
	const readStream = (stream: unknown): Promise<string> =>
		stream instanceof ReadableStream ? new Response(stream).text() : Promise.resolve('');
	const settled = (async () => {
		const [stdout, stderr, exitCode] = await Promise.all([
			readStream(subprocess.stdout),
			readStream(subprocess.stderr),
			subprocess.exited,
		]);
		return { exitCode, stderr, stdout };
	})();
	const race = await Promise.race([settled, Bun.sleep(timeoutMs).then(() => 'timeout' as const)]);
	if (race === 'timeout') {
		subprocess.kill();
		return { ok: false, stderr: `git ${args[0]} timed out`, stdout: '', timedOut: true };
	}
	return { ok: race.exitCode === 0, stderr: race.stderr, stdout: race.stdout, timedOut: false };
}

function failure(state: RepositoryRefsState, reason: string): RepositoryRefsResult {
	return { reason, refs: null, state };
}

function parseBranches(stdout: string): RepositoryBranch[] {
	const branches: RepositoryBranch[] = [];
	for (const line of stdout.split(/\r?\n/)) {
		if (!line.trim()) continue;
		// Format from for-each-ref: *(tab)main(tab)origin/main  (tabs from %09)
		const parts = line.split('\t');
		const head = parts[0]?.trim();
		const name = parts[1]?.trim();
		const upstream = parts[2]?.trim();
		if (!name) continue;
		branches.push({
			current: head === '*',
			name,
			upstream: upstream || null,
		});
	}
	return branches.slice(0, maxBranches);
}

function parseStashes(stdout: string): RepositoryStash[] {
	const stashes: RepositoryStash[] = [];
	for (const line of stdout.split(/\r?\n/)) {
		if (!line.trim()) continue;
		// Format: stash@{0}(tab)WIP on main: abc1234 feat: seed(tab)abc1234
		const parts = line.split('\t');
		const ref = parts[0]?.trim();
		const subject = parts[1]?.trim();
		const sha = parts[2]?.trim() ?? '';
		if (!ref || subject === undefined) continue;
		const indexMatch = /\{(\d+)\}/.exec(ref);
		stashes.push({
			index: indexMatch ? Number(indexMatch[1]) : stashes.length,
			sha,
			subject,
		});
	}
	return stashes.slice(0, maxStashes);
}

function parseWorktrees(stdout: string): RepositoryWorktree[] {
	const worktrees: RepositoryWorktree[] = [];
	// --porcelain: records separated by blank lines, fields one per line within each record.
	for (const block of stdout.split(/\r?\n\r?\n/)) {
		if (!block.trim()) continue;
		let path = '';
		let branch = '';
		let isBare = false;
		for (const line of block.split(/\r?\n/)) {
			if (line.startsWith('worktree ')) {
				path = line.slice('worktree '.length).trim();
			} else if (line.startsWith('bare')) {
				isBare = true;
			} else if (line.startsWith('branch ')) {
				branch = line
					.slice('branch '.length)
					.replace(/^refs\/heads\//, '')
					.trim();
			} else if (line.startsWith('detached')) {
				branch = '(detached HEAD)';
			}
		}
		if (!path) continue;
		worktrees.push({
			branch: branch || (isBare ? '(bare)' : '(detached HEAD)'),
			main: worktrees.length === 0,
			path,
		});
	}
	return worktrees.slice(0, maxWorktrees);
}

export async function readRepositoryRefs(projectPath: string): Promise<RepositoryRefsResult> {
	const dirStat = await statOrNull(projectPath);
	if (!dirStat?.isDirectory()) {
		return failure('project-missing', 'The project directory does not exist on disk.');
	}

	const probe = await runGit(
		projectPath,
		['rev-parse', '--is-inside-work-tree'],
		commandTimeoutMs
	);
	if (probe.ok && probe.stdout.trim() === 'true') {
		// continue
	} else if (probe.timedOut) {
		return failure('error', 'git timed out while inspecting the repository.');
	} else if (/not a git repository/i.test(probe.stderr)) {
		return failure('not-a-repo', 'The project directory is not a git repository.');
	} else if (probe.stderr.trim() === '' && probe.stdout.trim() === '') {
		return failure('error', 'git is not available on this system.');
	} else {
		return failure('not-a-repo', 'The project directory is not a git repository.');
	}

	const [branchList, stashList, worktreeList] = await Promise.all([
		runGit(
			projectPath,
			[
				'for-each-ref',
				'--format=%(HEAD)%09%(refname:short)%09%(upstream:short)',
				'--sort=-committerdate',
				'refs/heads/',
			],
			commandTimeoutMs
		),
		runGit(projectPath, ['stash', 'list', '--format=%gd%x09%s%x09%h'], commandTimeoutMs),
		runGit(projectPath, ['worktree', 'list', '--porcelain'], commandTimeoutMs),
	]);

	const branches = branchList.ok ? parseBranches(branchList.stdout) : [];
	const stashes = stashList.ok ? parseStashes(stashList.stdout) : [];
	const worktrees = worktreeList.ok ? parseWorktrees(worktreeList.stdout) : [];

	return {
		reason: null,
		refs: { branches, stashes, worktrees },
		state: 'ok',
	};
}
