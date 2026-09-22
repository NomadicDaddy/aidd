import { gitSuccess, readGitHead } from './git-exec.ts';
import { gitDirtySourcePaths } from './git.ts';

export interface OwnedMetadataCommit {
	hash: string;
	paths: string[];
}

/**
 * The records the run itself writes once the agent has stopped: feature records (a park's
 * `blockingContext`, a reconciled milestone or dependency set) and the roadmap they reconcile
 * against.
 *
 * An allowlist rather than all of `.aidd/`, because the rest of that directory is run output, not
 * a record. The ledger and the iteration logs are raw agent transcript that may carry sensitive
 * strings, and aidd never commits them — a test pins that invariant. Everything else under
 * `.aidd/` belongs to the agent or the operator, who commit it themselves.
 * @param path A repository-relative path with forward slashes.
 * @returns True when the run-end commit may stage it.
 */
function isCommittableRecord(path: string): boolean {
	return (
		path === '.aidd/roadmap.json' ||
		(path.startsWith('.aidd/features/') && path.endsWith('/feature.json'))
	);
}

/**
 * Commits the `.aidd` records aidd itself wrote after the agent's last commit.
 *
 * The park path is the one that made this necessary: an agent finishes, commits, and reports a
 * clean tree, and only then does the run write the feature's `blockingContext` and `updatedAt`.
 * In a project that tracks `.aidd/`, that left an uncommitted record behind after every parked
 * run, and the next run opened on a dirty worktree it had not made.
 *
 * Scope is deliberately narrow: only the records listed in isCommittableRecord, never source and
 * never the run's own output. A path dirty at run start is the operator's and is left alone, so an
 * edit made to a feature record while a run was going is never swept into aidd's commit. A
 * repository that gitignores `.aidd/` reports nothing dirty there, so it is a no-op.
 * @param projectDir The repository the run worked in.
 * @param dirtyAtStart Metadata paths already dirty when the run began.
 * @returns The commit, or undefined when there was nothing to commit or git refused.
 */
export async function commitOwnedMetadata(
	projectDir: string,
	dirtyAtStart: ReadonlySet<string> | undefined,
): Promise<OwnedMetadataCommit | undefined> {
	// An unknown baseline cannot separate the run's writes from the operator's, and guessing wrong
	// means committing someone else's work. Leave the tree as it is.
	if (dirtyAtStart === undefined) return undefined;
	const dirty = await gitDirtySourcePaths(projectDir, { includeAiddMetadata: true });
	if (dirty === undefined) return undefined;
	const paths = dirty.filter((path) => isCommittableRecord(path) && !dirtyAtStart.has(path));
	if (paths.length === 0) return undefined;
	const headBefore = await readGitHead(projectDir);
	// Explicit pathspecs, and `-A` scoped to them so a record the run deleted is staged too.
	if (!(await gitSuccess(projectDir, ['add', '-A', '--', ...paths]))) return undefined;
	const committed = await gitSuccess(projectDir, [
		'commit',
		'-m',
		'chore(aidd): record run metadata',
		'-m',
		`- written by aidd after the run's own commits: ${paths.join(', ')}`,
	]);
	if (!committed) return undefined;
	const headAfter = await readGitHead(projectDir);
	if (headAfter === undefined || headAfter === headBefore) return undefined;
	return { hash: headAfter, paths };
}
