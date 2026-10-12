import type { Dirent } from 'node:fs';

import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { AuditProfileMapping, AuditSurface, ProjectAuditEvidence } from '../index.ts';

import { projectDependencySources } from './project-packages.ts';

type SurfaceCatalogue = NonNullable<AuditProfileMapping['surfaces']>;

/**
 * The file scan is breadth-first from the project root and stops at whichever comes first:
 * directories more than MAX_DEPTH levels below the root, or MAX_ENTRIES directory entries
 * examined. Four levels reaches `apps/web/src/pages`, the deepest place a hand-written layout
 * keeps markup or migrations; anything deeper is generated or vendored. Five thousand entries is
 * several times what a large source tree holds within that depth, and bounds the work on a tree
 * that is not one, so choosing audits for a fleet never waits on a single huge checkout.
 * Breadth-first matters with a budget: evidence sits near the root, and it is read before the
 * budget can be spent deep in one branch. A scan that runs out reads the surface as absent, which
 * withholds an audit instead of applying one that cannot measure, and a project it gets wrong
 * marks the audit `required` in its overrides.
 */
const MAX_DEPTH = 4;
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
const migrationDirs = new Set(['drizzle', 'migrations']);

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

// A database is evidenced by a schema the project owns: SQL migrations or a Prisma schema. An
// import of `bun:sqlite` (or any other built-in driver) is deliberately not evidence, because a
// tool may open another program's database read-only and own no schema at all.
function schemaFile(entries: Dirent[], dir: string): string | undefined {
	const prisma = firstFile(entries, (name) => name === 'schema.prisma');
	if (prisma !== undefined) return prisma;
	if (!migrationDirs.has(basename(dir).toLowerCase())) return undefined;
	return firstFile(entries, (name) => name.endsWith('.sql'));
}

const fileEvidence: Record<AuditSurface, (entries: Dirent[], dir: string) => string | undefined> = {
	database: schemaFile,
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
		const file = fileEvidence[surface](entries, dir);
		if (file === undefined) continue;
		found.set(surface, dir === '' ? `${file} at the project root` : `${file} under ${dir}/`);
	}
}

async function listDirectory(path: string): Promise<Dirent[]> {
	try {
		return await readdir(path, { withFileTypes: true });
	} catch {
		return [];
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
	let level = [''];
	let budget = MAX_ENTRIES;
	for (let depth = 0; depth <= MAX_DEPTH; depth++) {
		const next: string[] = [];
		for (let index = 0; index < level.length; index++) {
			const dir = level[index]!;
			const entries = await listDirectory(join(projectDir, dir));
			budget -= entries.length;
			recordFileEvidence(dir, entries, wanted, found);
			if (wanted.every((surface) => found.has(surface)) || budget <= 0) return;
			next.push(...childDirectories(dir, entries));
		}
		level = next;
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
