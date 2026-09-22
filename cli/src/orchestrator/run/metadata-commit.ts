import { join } from 'node:path';

import { gitSuccess, readGitHead } from './git-exec.ts';
import { gitDirtySourcePaths } from './git.ts';

/**
 * SHA-256 of a file's bytes, for comparison against the run-start baseline.
 * @param projectDir The repository root.
 * @param path A repository-relative path.
 * @returns The hash, or undefined when the file cannot be read.
 */
async function hashFile(projectDir: string, path: string): Promise<string | undefined> {
	try {
		const bytes = await Bun.file(join(projectDir, path)).arrayBuffer();
		return Bun.SHA256.hash(new Uint8Array(bytes), 'hex');
	} catch {
		return undefined;
	}
}

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
 * never the run's own output. A record that is byte-identical to how the run found it is left
 * alone — that is dirt the run did not make. A repository that gitignores `.aidd/` reports nothing
 * dirty there, so it is a no-op.
 * @param projectDir The repository the run worked in.
 * @param dirtyAtStart Content of the records already dirty when the run began.
 * @returns The commit, or undefined when there was nothing to commit or git refused.
 */
export async function commitOwnedMetadata(
	projectDir: string,
	dirtyAtStart: ReadonlyMap<string, string> | undefined,
): Promise<OwnedMetadataCommit | undefined> {
	// An unknown baseline cannot separate the run's writes from the operator's, and guessing wrong
	// means committing someone else's work. Leave the tree as it is.
	if (dirtyAtStart === undefined) return undefined;
	const dirty = await gitDirtySourcePaths(projectDir, { includeAiddMetadata: true });
	if (dirty === undefined) return undefined;
	const candidates = dirty.filter((path) => isCommittableRecord(path));
	const paths: string[] = [];
	for (const path of candidates) {
		const before = dirtyAtStart.get(path);
		// Unchanged since the run started: nobody wrote it this run, so it stays where it was.
		if (before !== undefined && before === (await hashFile(projectDir, path))) continue;
		paths.push(path);
	}
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
