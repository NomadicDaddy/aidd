// `.aidd/` is gitignored in every supported profile, so a worktree checked out from HEAD
// contains no project metadata — no features, roadmap, or project docs. A store rooted there
// sees an empty project: selection finds nothing and the run ends `no_work` (exit 0) no matter
// how much eligible work the canonical store holds. This session bridges that gap: it seeds the
// worktree with a copy of the canonical `.aidd` (minus volatile per-run state) before anything
// reads the run store, records a baseline hash per file, and after a successful merge-back
// writes only the files the run actually changed back to the canonical store.
//
// Write-back is baseline-hash conflict-aware: for every file the run changed or deleted, it
// compares the file's CURRENT canonical hash against the seed-time baseline. A mismatch means
// another actor (operator or a concurrent run) edited that file while this run was in flight, so
// applying the run's version would silently clobber their edit. On ANY conflict the whole delta is
// withheld — the run parks (exit 77, worktree preserved, canonical metadata untouched) instead of
// overwriting, mirroring the git merge-conflict park semantics. Files the run never touched are
// never checked, so concurrent canonical edits to untouched files never block write-back.

import { metadataPath, STOP_FILE } from 'aidd-shared/metadata/paths';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Top-level `.aidd` entries that are volatile per-run state: owned by the live project
 * (ledger, heartbeats, stop signal) or persisted separately as run evidence (iterations).
 * Never seeded into a worktree and never written back. */
const volatileEntries = new Set(['active-runs', 'iterations', 'runs.jsonl', STOP_FILE]);

export interface WorktreeMetadataSession {
	/** sha256 per metadata file (path relative to `.aidd`, `/`-separated), captured at seed
	 * time. Write-back copies only files whose content no longer matches this baseline. */
	baseline: Map<string, string>;
	seededFiles: number;
}

export interface WorktreeMetadataDelta {
	applied: string[];
	deleted: string[];
}

/** A `.aidd` metadata file the run changed (or deleted) that ALSO changed canonically while the
 * run was in flight. The seed-time baseline hash disagrees with the file's CURRENT canonical
 * hash, so applying the run's version would silently clobber another actor's edit. */
export interface WorktreeMetadataConflict {
	/** `.aidd` paths the run changed or deleted whose canonical hash no longer matches the seed
	 * baseline — applying them would overwrite a concurrent edit. */
	conflicted: string[];
}

function hashContent(content: Uint8Array): string {
	return createHash('sha256').update(content).digest('hex');
}

async function walkMetadataFiles(root: string, relative = ''): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(relative === '' ? root : join(root, relative), {
			withFileTypes: true,
		});
	} catch {
		return [];
	}
	const files: string[] = [];
	for (const entry of entries) {
		if (relative === '' && volatileEntries.has(entry.name)) continue;
		const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
		if (entry.isDirectory()) files.push(...(await walkMetadataFiles(root, rel)));
		else if (entry.isFile()) files.push(rel);
	}
	return files.sort();
}

// Parity compares feature MANIFESTS (feature.json files), not directories: seeding copies
// files, so an empty directory under canonical `features/` (a pruning miss, an operator's
// scratch dir) can never be mirrored and a directory-count check would brick every worktree
// run against that project.
const featureManifestPattern = /^features\/[^/]+\/feature\.json$/;

function countFeatureManifests(files: string[]): number {
	return files.filter((rel) => featureManifestPattern.test(rel)).length;
}

/** Copy the canonical `.aidd` into a freshly created worktree and record baseline hashes.
 * Throws when the seeded feature set does not match the canonical one — a partial seed would
 * silently shrink the run's visible backlog, which is exactly the failure this module exists
 * to prevent. */
export async function seedWorktreeMetadata(
	projectDir: string,
	worktreeDir: string
): Promise<WorktreeMetadataSession> {
	const sourceRoot = metadataPath(projectDir);
	const targetRoot = metadataPath(worktreeDir);
	const files = await walkMetadataFiles(sourceRoot);
	const baseline = new Map<string, string>();
	for (const rel of files) {
		const content = await readFile(join(sourceRoot, rel));
		const target = join(targetRoot, rel);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, content);
		baseline.set(rel, hashContent(content));
	}
	const canonicalManifests = countFeatureManifests(files);
	const seededManifests = countFeatureManifests(await walkMetadataFiles(targetRoot));
	if (seededManifests !== canonicalManifests) {
		throw new Error(
			`[worktree] metadata seeding incomplete: ${seededManifests}/${canonicalManifests} feature manifests reached the worktree store`
		);
	}
	return { baseline, seededFiles: files.length };
}

// After deleting a written-back file, drop now-empty ancestor directories (up to the metadata
// root) so a deleted feature's directory does not linger. rmdir refuses non-empty directories,
// which is exactly the stop condition.
async function pruneEmptyParents(targetRoot: string, rel: string): Promise<void> {
	for (let dir = dirname(rel); dir !== '.' && dir !== ''; dir = dirname(dir)) {
		try {
			await rmdir(join(targetRoot, dir));
		} catch {
			return;
		}
	}
}

/** Apply the run's metadata delta to the canonical `.aidd`: copy back files created or changed
 * since seeding, delete files the run removed. Files the run never touched are left alone, so
 * canonical edits made while the run was in flight survive.
 *
 * Conflict detection: before touching any file the run changed or deleted, compare the file's
 * CURRENT canonical content hash against the seed-time baseline. When ANY to-be-applied/deleted
 * file's canonical hash no longer matches the baseline (another actor edited it mid-run), the
 * whole delta is withheld and the conflicts are returned — the caller parks the run instead of
 * overwriting. Canonical metadata is left completely untouched when conflicts exist. */
export async function writeBackWorktreeMetadata(
	projectDir: string,
	worktreeDir: string,
	session: WorktreeMetadataSession
): Promise<WorktreeMetadataConflict | WorktreeMetadataDelta> {
	const sourceRoot = metadataPath(worktreeDir);
	const targetRoot = metadataPath(projectDir);
	const files = await walkMetadataFiles(sourceRoot);
	const present = new Set(files);

	// Determine which files the run changed (worktree content != baseline) or deleted (baseline
	// key missing from the worktree). Only THESE are subject to conflict detection; untouched
	// files are never checked and never block write-back.
	const changed: string[] = [];
	for (const rel of files) {
		const content = await readFile(join(sourceRoot, rel));
		if (session.baseline.get(rel) === hashContent(content)) continue;
		changed.push(rel);
	}
	const deletedCandidates: string[] = [];
	for (const rel of session.baseline.keys()) {
		if (present.has(rel)) continue;
		deletedCandidates.push(rel);
	}

	// Conflict check: for each file the run changed or deleted, compare the CURRENT canonical
	// hash against the seed baseline. A file absent canonically now hashes to undefined; if the
	// baseline had it, someone else deleted it — still a conflict.
	const conflicted: string[] = [];
	for (const rel of [...changed, ...deletedCandidates]) {
		const baselineHash = session.baseline.get(rel);
		let currentCanonicalHash: string | undefined;
		try {
			const canonical = await readFile(join(targetRoot, rel));
			currentCanonicalHash = hashContent(canonical);
		} catch {
			currentCanonicalHash = undefined;
		}
		if (currentCanonicalHash !== baselineHash) conflicted.push(rel);
	}
	if (conflicted.length > 0) return { conflicted: conflicted.sort() };

	// No conflicts: apply the delta normally.
	const applied: string[] = [];
	for (const rel of changed) {
		const content = await readFile(join(sourceRoot, rel));
		const target = join(targetRoot, rel);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, content);
		applied.push(rel);
	}
	const deleted: string[] = [];
	for (const rel of deletedCandidates) {
		await rm(join(targetRoot, rel), { force: true });
		await pruneEmptyParents(targetRoot, rel);
		deleted.push(rel);
	}
	return { applied, deleted };
}
