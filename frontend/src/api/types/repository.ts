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
	/** Tag names, newest first, capped backend-side. RepositoryInfo.tags carries the true total. */
	tags: string[];
	worktrees: RepositoryWorktree[];
}

export interface RepositoryRefsResponse {
	reason: null | string;
	refs: null | RepositoryRefs;
	state: RepositoryInfoState;
}

// Hand-mirrored from backend/src/services/git/workingTree.ts and workingTreeActions.ts.

export type WorkingTreeState = RepositoryInfoState;

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

export interface WorkingTreeResponse {
	files: WorkingTreeFile[];
	reason: null | string;
	state: WorkingTreeState;
	/** True when the listing was capped at the server's file budget. */
	truncated: boolean;
}

export interface WorkingTreeActionResponse {
	/** The listing after the action, so the client refreshes in the same round trip. */
	after: WorkingTreeResponse;
	ok: boolean;
	reason: null | string;
}
