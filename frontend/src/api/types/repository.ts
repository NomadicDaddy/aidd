// Hand-mirrored from the backend repository-info result shape
// (backend/src/services/git/repoStats.ts). The endpoint answers HTTP 200 with a `state`
// discriminator instead of error statuses, matching the commit-diff / project-file surfaces.

export type RepositoryInfoState = 'error' | 'not-a-repo' | 'ok' | 'project-missing';

export interface RepositoryAuthor {
	commits: number;
	email: string;
	name: string;
}

export interface RepositoryLanguage {
	bytes: number;
	files: number;
	language: string;
	lines: number;
}

export interface RepositoryLatestCommit {
	authorName: string;
	date: string;
	hash: string;
	subject: string;
}

export interface RepositoryInfo {
	authors: RepositoryAuthor[];
	currentBranch: string;
	dominantLanguage: null | string;
	languages: RepositoryLanguage[];
	latestCommit: null | RepositoryLatestCommit;
	localBranches: number;
	remoteBranches: number;
	sizeBytes: number;
	tags: number;
	totalFiles: number;
	totalLines: number;
	/** True when the line-of-code scan stopped early because it hit the server's time/file budget. */
	truncated: boolean;
}

export interface RepositoryInfoResponse {
	info: null | RepositoryInfo;
	reason: null | string;
	state: RepositoryInfoState;
}

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

export interface RepositoryRefsResponse {
	reason: null | string;
	refs: null | RepositoryRefs;
	state: RepositoryInfoState;
}
