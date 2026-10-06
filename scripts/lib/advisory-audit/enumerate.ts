import { readdir } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';

/** What a lockfile is, which decides whether it is audited and where its findings are reported. */
export type LockfileKind = 'artifact' | 'clone' | 'foreign' | 'project';

/** Lockfiles of other package managers: listed so the gap is visible, never audited by bun. */
const FOREIGN_LOCKFILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);

export interface LockfileEntry {
	kind: LockfileKind;
	lockPath: string;
	owners: string[];
	/** For a clone, the project its findings are reported under. */
	parentTree?: string;
	/** Why the lockfile is not audited, for the report. */
	reason?: string;
	root: string;
	/** The tree the lockfile belongs to (its directory). */
	treeDir: string;
	/** The tree's name for the report: the top-level directory under its root. */
	treeName: string;
}

/** A lockfile under one of these directory names is a build output, never a tree to fix. */
const ARTIFACT_SEGMENTS = new Set(['aidd-build-proofs', 'build', 'dist', 'tmp']);

/** Scratch clones and worktrees, reported under the project whose fix lands. */
const CLONES: { parent: string; pattern: RegExp }[] = [
	{ parent: 'aidd', pattern: /^aidd-(?:panel-reaudit|frontend-audit)$/ },
	{ parent: 'spernakit', pattern: /^spernakit-(?:compiler|site)$/ },
	{ parent: 'summon', pattern: /^summon-(?!stream$).+$/ },
];

/**
 * Owners by tree name. The map is supplied by the caller from a file outside the repository: tree
 * names can be private, and who owns what is the operator's to settle, never guessed here. A tree
 * missing from the map is reported as unowned.
 */
export type OwnerMap = Readonly<Record<string, string[]>>;

function segments(path: string): string[] {
	return path.split(/[\\/]+/).filter((part) => part.length > 0);
}

function isArtifactSegment(part: string, ignored: ReadonlySet<string>): boolean {
	return (
		ARTIFACT_SEGMENTS.has(part) ||
		part.startsWith('.tmp') ||
		// aidd-build-proofs and aidd-build-proofs-public hold whole vendored source trees.
		part.startsWith('aidd-build-proofs') ||
		ignored.has(part.toLowerCase())
	);
}

/**
 * Classify one lockfile found under `root`. The root itself may be a tree (D:\infra is one).
 * `ignored` is the panel's web.ignoredFolders: what aidd does not discover, the audit skips too.
 */
export function classifyLockfile(
	lockPath: string,
	root: string,
	ignored: ReadonlySet<string> = new Set(),
	owners: OwnerMap = {},
): LockfileEntry {
	const treeDir = dirname(lockPath);
	const rel = segments(relative(root, treeDir));
	const treeName = rel[0] ?? basename(root);
	const base = { lockPath, owners: owners[treeName] ?? [], root, treeDir, treeName };
	if (basename(lockPath) !== 'bun.lock') {
		return {
			...base,
			kind: 'foreign',
			owners: [],
			reason: `not a bun tree (${basename(lockPath)}); not audited`,
		};
	}
	const artifact = rel.find((part) => isArtifactSegment(part, ignored));
	if (artifact !== undefined) {
		return {
			...base,
			kind: 'artifact',
			owners: [],
			reason:
				artifact === 'dist' || artifact === 'build'
					? 'historical release artifact, not drift: a frozen copy of a superseded dependency set'
					: ignored.has(artifact.toLowerCase())
						? `under ${artifact}/, which the panel's ignoredFolders excludes`
						: `build output under ${artifact}/`,
		};
	}
	const clone = CLONES.find(({ pattern }) => pattern.test(treeName));
	if (clone !== undefined) {
		return {
			...base,
			kind: 'clone',
			owners: owners[clone.parent] ?? [],
			parentTree: clone.parent,
		};
	}
	return { ...base, kind: 'project' };
}

/**
 * Every bun.lock under `root` to `maxDepth` directory levels, never descending into node_modules
 * or .git. Depth 4 reaches a workspace's own lockfile (deeper/frontend) and deeper's release
 * directories, which is what the report must be able to name as skipped.
 */
export async function findLockfiles(root: string, maxDepth = 4): Promise<string[]> {
	const found: string[] = [];
	async function walk(dir: string, depth: number): Promise<void> {
		let entries: { isDirectory: () => boolean; isFile: () => boolean; name: string }[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.isFile() && (entry.name === 'bun.lock' || FOREIGN_LOCKFILES.has(entry.name)))
				found.push(join(dir, entry.name));
			else if (
				entry.isDirectory() &&
				depth < maxDepth &&
				entry.name !== 'node_modules' &&
				entry.name !== '.git'
			)
				await walk(join(dir, entry.name), depth + 1);
		}
	}
	await walk(root, 0);
	return found.sort();
}

export interface ScannedRoot {
	entries: LockfileEntry[];
	/** False when the root could not be read at all: that is UNSWEPT, never "no npm surface". */
	readable: boolean;
	root: string;
}

/** A readable root with no lockfile at all has no npm surface; the report says so instead of "clean". */
export async function enumerateRoots(
	roots: string[],
	maxDepth = 4,
	ignored: ReadonlySet<string> = new Set(),
	owners: OwnerMap = {},
): Promise<ScannedRoot[]> {
	const result: ScannedRoot[] = [];
	for (const root of roots) {
		let readable = true;
		try {
			await readdir(root);
		} catch {
			readable = false;
		}
		const lockfiles = readable ? await findLockfiles(root, maxDepth) : [];
		result.push({
			entries: lockfiles.map((path) => classifyLockfile(path, root, ignored, owners)),
			readable,
			root,
		});
	}
	return result;
}

/** The report key for a tree: its root's last segment and the tree name, so two roots never collide. */
export function treeKey(entry: LockfileEntry): string {
	const rootName = basename(entry.root);
	const within = relative(entry.root, entry.treeDir).split(sep).join('/');
	return within.length > 0 ? `${rootName}/${within}` : rootName;
}
