import type { Dirent } from 'node:fs';

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { AuditProfileMapping, AuditSurface, ProjectAuditEvidence } from '../index.ts';

import { projectDependencySources } from './project-packages.ts';

type SurfaceCatalogue = NonNullable<AuditProfileMapping['surfaces']>;

/**
 * The file scan is breadth-first from the project root, with no depth limit, and reads the whole
 * tree it is allowed into unless it examines MAX_ENTRIES directory entries first. The budget is
 * there so choosing audits for a fleet never waits on one huge checkout; breadth-first matters
 * with a budget, because evidence sits near the root and is read before the budget can be spent
 * deep in one branch.
 *
 * Only a scan that finished can say a surface is absent. One that ran out of budget, or met a
 * directory it could not read, has ruled nothing out: every surface it was still looking for
 * counts as present, and its evidence says why the search was incomplete. An audit that runs and
 * finds nothing costs a session, while one withheld on an unfinished search is silently never
 * run, and growing a tree or losing access to part of it must not be able to remove an audit.
 */
const MAX_ENTRIES = 5000;

/**
 * Directories that are never the project's own shipped source: installed or generated trees, test
 * and fixture trees, and documentation, examples and scripts, where an `.html` page or a `.sql`
 * file describes or exercises the project without being part of what it serves. `config` holds
 * settings, and its file names are not this scan's business. Dot-directories are skipped by name.
 */
const skippedDirs = new Set([
	'__tests__',
	'build',
	'config',
	'coverage',
	'dist',
	'docs',
	'examples',
	'fixtures',
	'node_modules',
	'out',
	'scripts',
	'test',
	'tests',
	'vendor',
]);

const markupExtensions = ['.astro', '.html', '.jsx', '.svelte', '.tsx', '.vue'];
const databaseFileExtensions = ['.db', '.sqlite', '.sqlite3'];

function isWalkable(entry: Dirent): boolean {
	return (
		entry.isDirectory() &&
		!entry.isSymbolicLink() &&
		!entry.name.startsWith('.') &&
		!skippedDirs.has(entry.name)
	);
}

function firstFile(entries: Dirent[], matches: (name: string) => boolean): string | undefined {
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index]!;
		if (entry.isFile() && matches(entry.name.toLowerCase())) return entry.name;
	}
	return undefined;
}

// Markup source is counted wherever it is kept, and whether or not anything serves it: a static
// site's `index.html` and an Electron renderer's page both count. Telling a served page from an
// unserved one is not attempted; a project this gets wrong says so in its overrides.
function markupFile(entries: Dirent[]): string | undefined {
	return firstFile(entries, (name) => markupExtensions.some((ext) => name.endsWith(ext)));
}

// A database is evidenced by something the project owns: a Prisma schema, a database file, or a
// SQL script, wherever the scan reaches. A project can keep its database with no driver package
// at all (a built-in driver, or another runtime entirely) and its SQL outside any directory named
// for migrations, so neither is required. An import of `bun:sqlite` (or any other built-in
// driver) alone is deliberately not evidence, because a tool may open another program's database
// read-only and own nothing.
function databaseFile(entries: Dirent[]): string | undefined {
	return (
		firstFile(entries, (name) => name === 'schema.prisma') ??
		firstFile(entries, (name) => databaseFileExtensions.some((ext) => name.endsWith(ext))) ??
		firstFile(entries, (name) => name.endsWith('.sql'))
	);
}

const fileEvidence: Record<AuditSurface, (entries: Dirent[]) => string | undefined> = {
	database: databaseFile,
	'web-frontend': markupFile,
};

function recordFileEvidence(
	dir: string,
	entries: Dirent[],
	wanted: readonly AuditSurface[],
	found: Map<AuditSurface, string>,
): void {
	for (let index = 0; index < wanted.length; index++) {
		const surface = wanted[index]!;
		if (found.has(surface)) continue;
		const file = fileEvidence[surface](entries);
		if (file === undefined) continue;
		found.set(surface, dir === '' ? `${file} at the project root` : `${file} under ${dir}/`);
	}
}

// Undefined when the directory could not be read, which is not the same as an empty one.
async function listDirectory(path: string): Promise<Dirent[] | undefined> {
	try {
		return await readdir(path, { withFileTypes: true });
	} catch {
		return undefined;
	}
}

function childDirectories(dir: string, entries: Dirent[]): string[] {
	const children: string[] = [];
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index]!;
		if (isWalkable(entry)) children.push(dir === '' ? entry.name : `${dir}/${entry.name}`);
	}
	return children;
}

async function scanForFileEvidence(
	projectDir: string,
	wanted: readonly AuditSurface[],
	found: Map<AuditSurface, string>,
): Promise<void> {
	const scan: FileScan = {
		budget: MAX_ENTRIES,
		found,
		incomplete: undefined,
		queue: [''],
		wanted,
	};
	for (let index = 0; index < scan.queue.length; index++) {
		const stop = await scanDirectory(projectDir, scan.queue[index]!, scan);
		if (stop) break;
	}
	// Marks only what is still missing, so a scan that found everything marks nothing.
	if (scan.incomplete !== undefined) markUnfinished(wanted, found, scan.incomplete);
}

interface FileScan {
	budget: number;
	found: Map<AuditSurface, string>;
	/** Why the scan cannot say a surface is absent, once something has stopped it finishing. */
	incomplete: string | undefined;
	queue: string[];
	wanted: readonly AuditSurface[];
}

// Reads one directory into the scan. Returns true when the scan should stop: every surface has
// been found, or the budget is spent.
async function scanDirectory(projectDir: string, dir: string, scan: FileScan): Promise<boolean> {
	const entries = await listDirectory(join(projectDir, dir));
	if (entries === undefined) {
		scan.incomplete ??= `${dir === '' ? 'the project root' : `${dir}/`} could not be read`;
		return false;
	}
	scan.budget -= entries.length;
	recordFileEvidence(dir, entries, scan.wanted, scan.found);
	if (scan.wanted.every((surface) => scan.found.has(surface))) return true;
	if (scan.budget <= 0) {
		scan.incomplete ??= `it stopped at its limit of ${MAX_ENTRIES} entries`;
		return true;
	}
	scan.queue.push(...childDirectories(dir, entries));
	return false;
}

function markUnfinished(
	wanted: readonly AuditSurface[],
	found: Map<AuditSurface, string>,
	why: string,
): void {
	for (let index = 0; index < wanted.length; index++) {
		const surface = wanted[index]!;
		if (!found.has(surface)) found.set(surface, `file scan incomplete: ${why}`);
	}
}

/**
 * Which of the catalogue's surfaces a project has, each with the evidence that decided it. A
 * declared package settles a surface without touching the tree; the file scan runs only for a
 * surface no manifest evidences. A surface the catalogue does not define is not looked for.
 * @param projectDir The project to examine.
 * @param catalogue The catalogue's surface definitions, naming the packages that evidence each.
 * @param declared The project's declared packages, each with the manifest that declares it.
 * @returns The surfaces present, mapped to a short statement of why.
 */
export async function detectProjectSurfaces(
	projectDir: string,
	catalogue: SurfaceCatalogue,
	declared: ReadonlyMap<string, string>,
): Promise<Map<AuditSurface, string>> {
	const wanted = Object.keys(catalogue) as AuditSurface[];
	const found = new Map<AuditSurface, string>();
	for (let index = 0; index < wanted.length; index++) {
		const surface = wanted[index]!;
		const name = catalogue[surface]?.packages.find((candidate) => declared.has(candidate));
		if (name !== undefined) found.set(surface, `declares ${name} in ${declared.get(name)}`);
	}
	if (found.size < wanted.length) await scanForFileEvidence(projectDir, wanted, found);
	return found;
}

/**
 * Everything applicability needs to know about one project beyond its profile, read once: the
 * packages its manifests declare and the surfaces detected in its tree. Every reader that decides
 * whether an audit applies to a project gets its evidence here, so they cannot disagree.
 */
export async function readProjectAuditEvidence(
	projectDir: string,
	mapping: AuditProfileMapping,
): Promise<ProjectAuditEvidence> {
	const declared = await projectDependencySources(projectDir);
	return {
		packages: new Set(declared.keys()),
		surfaces: await detectProjectSurfaces(projectDir, mapping.surfaces ?? {}, declared),
	};
}
