import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/**
 * The manifest and lockfile sweep behind the daily digest's advisory row.
 *
 * The row used to be produced by whatever the digest agent wrote that morning. On 2026-10-08 its
 * sweeper walked node_modules on Windows, counted 19,733 files where a bounded walk sees 613, and
 * reported two "hits" that were third-party packages' own devDependencies (Carl, room #7405). This
 * module is the one walk every run takes: manifests and lockfiles only, never node_modules, and a
 * named package matches a dependency key or a lockfile entry, never a substring.
 */

/** Files that carry a declared or resolved dependency. */
export const MANIFEST_NAMES = new Set([
	'bun.lock',
	'package-lock.json',
	'package.json',
	'pnpm-lock.yaml',
	'yarn.lock',
]);

const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules']);

export interface DirectoryEntry {
	isDirectory: () => boolean;
	isFile: () => boolean;
	name: string;
}

/** Lists one directory; tests inject a lister that fails for a chosen subtree. */
export type DirectoryLister = (dir: string) => Promise<DirectoryEntry[]>;

export const listDirectory: DirectoryLister = (dir) => readdir(dir, { withFileTypes: true });

export interface RootScan {
	/** Manifest and lockfile paths read, in walk order. */
	files: string[];
	/** False when the root itself could not be listed: UNSWEPT, never "no npm surface". */
	readable: boolean;
	root: string;
	/** Subtrees of a readable root that could not be listed; each one is UNSWEPT. */
	unreadable: string[];
}

/**
 * Every manifest and lockfile under `root`, never descending into node_modules or .git.
 * @param root The directory to walk.
 * @param maxDepth How many directory levels below the root to visit.
 * @param list The directory lister; tests inject one that fails for a chosen subtree.
 * @returns The files found and the directories that could not be listed.
 */
export async function scanRoot(
	root: string,
	maxDepth = 6,
	list: DirectoryLister = listDirectory,
): Promise<RootScan> {
	const files: string[] = [];
	const unreadable: string[] = [];
	let readable = true;
	async function walk(dir: string, depth: number): Promise<void> {
		let entries: DirectoryEntry[];
		try {
			entries = await list(dir);
		} catch {
			if (depth === 0) readable = false;
			else unreadable.push(dir);
			return;
		}
		for (const entry of entries) {
			if (entry.isFile() && MANIFEST_NAMES.has(entry.name)) files.push(join(dir, entry.name));
			else if (
				entry.isDirectory() &&
				depth < maxDepth &&
				!SKIPPED_DIRECTORIES.has(entry.name)
			)
				await walk(join(dir, entry.name), depth + 1);
		}
	}
	await walk(root, 0);
	return { files: files.sort(), readable, root, unreadable: unreadable.sort() };
}

const DEPENDENCY_MAPS = [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
] as const;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// package.json: the name is a key of one of the four dependency maps; the value is its range.
function matchPackageJson(text: string, name: string): string[] {
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(text) as Record<string, unknown>;
	} catch {
		return [];
	}
	const versions: string[] = [];
	for (const map of DEPENDENCY_MAPS) {
		const entries = parsed[map];
		if (typeof entries !== 'object' || entries === null) continue;
		const range = (entries as Record<string, unknown>)[name];
		if (typeof range === 'string') versions.push(range);
	}
	return versions;
}

// bun.lock: a resolved entry is `"<key>": ["<name>@<version>", …]` in the packages section. The
// key is the install name and the spec carries the real name, so an alias still matches by spec.
function matchBunLock(text: string, name: string): string[] {
	const pattern = new RegExp(`^\\s*"(?:[^"]+)": \\["${escapeRegExp(name)}@([^"]+)"`, 'gm');
	return [...text.matchAll(pattern)].map((match) => match[1] ?? '');
}

// package-lock.json: a resolved entry is `packages["…node_modules/<name>"].version`; v1 files
// carry a `dependencies` map keyed by the bare name.
function matchPackageLock(text: string, name: string): string[] {
	let parsed: { dependencies?: Record<string, unknown>; packages?: Record<string, unknown> };
	try {
		parsed = JSON.parse(text) as typeof parsed;
	} catch {
		return [];
	}
	const versions: string[] = [];
	const suffix = `node_modules/${name}`;
	for (const [key, entry] of Object.entries(parsed.packages ?? {})) {
		if (key !== suffix && !key.endsWith(`/${suffix}`)) continue;
		const version = (entry as { version?: unknown }).version;
		versions.push(typeof version === 'string' ? version : 'unknown');
	}
	const legacy = parsed.dependencies?.[name];
	if (typeof legacy === 'object' && legacy !== null) {
		const version = (legacy as { version?: unknown }).version;
		versions.push(typeof version === 'string' ? version : 'unknown');
	}
	return versions;
}

// pnpm-lock.yaml (`  /<name>@<version>:` or `  <name>@<version>:`) and yarn.lock
// (`"<name>@<range>":` or `<name>@<range>:`) are matched at the start of a line only.
function matchTextLock(text: string, name: string): string[] {
	const pattern = new RegExp(`^\\s*/?"?${escapeRegExp(name)}@([^:,"\\s]+)`, 'gm');
	return [...text.matchAll(pattern)].map((match) => match[1] ?? '');
}

export interface Hit {
	file: string;
	name: string;
	version: string;
}

/**
 * Every exact dependency or lockfile match for the named packages in one file.
 * @param file The manifest or lockfile path.
 * @param names The package names the advisories named.
 * @param read The file reader; tests inject one.
 * @returns One hit per matching entry, in name order.
 */
export async function matchFile(
	file: string,
	names: readonly string[],
	read: (path: string) => Promise<string> = (path) => readFile(path, 'utf8'),
): Promise<Hit[]> {
	let text: string;
	try {
		text = await read(file);
	} catch {
		return [];
	}
	const base = file.split(sep).pop() ?? file;
	const hits: Hit[] = [];
	for (const name of names) {
		const versions =
			base === 'package.json'
				? matchPackageJson(text, name)
				: base === 'bun.lock'
					? matchBunLock(text, name)
					: base === 'package-lock.json'
						? matchPackageLock(text, name)
						: matchTextLock(text, name);
		for (const version of versions) hits.push({ file, name, version });
	}
	return hits;
}

/**
 * A hit as the row prints it: the file relative to its root, then package@version.
 * @param hit The match.
 * @param root The root the file was found under.
 * @returns `<root>\\<relative path>:<name>@<version>`.
 */
export function describeHit(hit: Hit, root: string): string {
	return `${join(root, relative(root, hit.file))}:${hit.name}@${hit.version}`;
}
