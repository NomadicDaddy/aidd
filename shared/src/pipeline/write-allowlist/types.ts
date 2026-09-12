// Shapes shared by the guard's capture/diff half (../writeAllowlist.ts) and its revert half
// (./revert.ts). They live here rather than in either half so the two can import from each other's
// vocabulary without a cycle.

export interface WriteGuardSnapshot {
	/** Porcelain status line per path (XY codes), for paths dirty at baseline. */
	entries: Map<string, string>;
	/** HEAD sha at baseline (undefined for a repo with no commits yet). Backends that
	 * commit their work move HEAD, which hides the files from `git status`; comparing
	 * HEAD before/after recovers those committed paths. */
	head: string | undefined;
}

export interface WriteViolation {
	/** True when the violation reached a commit (HEAD moved); revert needs history rewind. */
	committed: boolean;
	/** True when the path was dirty at baseline but is now clean — a destructive operation
	 * (git reset --hard, git checkout ., etc.) discarded uncommitted operator work. The file
	 * content is already gone; revert attempts to restore from the baseline HEAD. */
	destructivelyDiscarded: boolean;
	path: string;
	/** True when the path did not exist in the baseline (a brand-new file/dir). */
	untracked: boolean;
}
