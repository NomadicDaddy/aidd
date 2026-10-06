export interface AuditFinding {
	ghsa: string;
	package: string;
	severity: string;
	title: string;
	url: string;
	vulnerableVersions: string;
}

/** A package the lock has fixed but a dependent still loads from the old store directory. */
export interface LockOnly {
	dependent: string;
	/** The version the dependent's node_modules link resolves to, or null when the link is missing. */
	linked: null | string;
	locked: string;
	package: string;
}

export interface TreeAudit {
	durationMs: number;
	error?: string;
	/** bun audit's exit code: 0 clean, 1 findings; anything else is UNSWEPT whatever stdout held. */
	exitCode?: number;
	findings: AuditFinding[];
	key: string;
	lockOnly: LockOnly[];
	/** The tree has no node_modules at all, so the store check has nothing to read. */
	notInstalled: boolean;
	owners: string[];
	status: 'audited' | 'unswept';
	treeDir: string;
}

export interface Hold {
	blockedOn: 'human' | 'upstream';
	date: string;
	ghsa: string;
	owner: string;
	package: string;
	reason: string;
	tree: string;
	until?: string;
}

export interface HoldStatus {
	ageDays: number;
	hold: Hold;
	stale: boolean;
}

export interface SkippedLockfile {
	key: string;
	lockPath: string;
	reason: string;
}

export interface RunRecord {
	/** The command each tree was audited with, kept so the record says what produced it. */
	command: string;
	generatedAt: string;
	/** Configured roots that could not be read at all: UNSWEPT, never "no npm surface". */
	missingRoots: string[];
	noSurface: string[];
	roots: string[];
	skipped: SkippedLockfile[];
	trees: TreeAudit[];
}
