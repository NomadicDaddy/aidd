import { metadataPath } from 'aidd-shared/metadata/paths';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import type { ProjectDiscoverySkippedRootDto, ProjectImportCandidateDto } from '../../types.ts';

import { encodeProjectId } from '../../paths.ts';

export interface RootScanResult {
	projects: { path: string; root: string }[];
	skipped: null | ProjectDiscoverySkippedRootDto;
}

export interface CandidateScanResult {
	candidates: ProjectImportCandidateDto[];
	skipped: null | ProjectDiscoverySkippedRootDto;
}

export async function directoryExists(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

export async function fileExists(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

export async function hasAiddMetadata(path: string): Promise<boolean> {
	return await directoryExists(metadataPath(path));
}

function globToRegExp(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp(`^${escaped}$`);
}

export function createIgnoredDirectoryMatcher(
	patterns: Iterable<string>
): (name: string) => boolean {
	const exact = new Set<string>();
	const regexes: RegExp[] = [];
	for (const raw of patterns) {
		const pattern = raw.trim();
		if (!pattern) continue;
		if (pattern.includes('*') || pattern.includes('?')) {
			regexes.push(globToRegExp(pattern));
		} else {
			exact.add(pattern);
		}
	}
	return (name: string) => exact.has(name) || regexes.some((regex) => regex.test(name));
}

export async function scanRoot(
	root: string,
	maxDepth: number,
	isIgnoredDirectory: (name: string) => boolean
): Promise<RootScanResult> {
	const resolvedRoot = resolve(root);
	if (!(await directoryExists(resolvedRoot))) {
		return {
			projects: [],
			skipped: {
				path: resolvedRoot,
				reason: 'Configured root does not exist or is not a directory',
			},
		};
	}
	const projects = new Set<string>();
	let topLevelReadError: null | string = null;
	async function visit(path: string, depth: number): Promise<void> {
		if (await hasAiddMetadata(path)) {
			projects.add(path);
			return;
		}
		if (depth >= maxDepth) return;
		let entries: { isDirectory(): boolean; name: string }[];
		try {
			entries = await readdir(path, { withFileTypes: true });
		} catch (err) {
			if (path === resolvedRoot) {
				topLevelReadError =
					err instanceof Error ? err.message : 'Failed to read configured root';
			}
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || isIgnoredDirectory(entry.name)) continue;
			await visit(join(path, entry.name), depth + 1);
		}
	}
	await visit(resolvedRoot, 0);
	if (topLevelReadError && projects.size === 0) {
		return {
			projects: [],
			skipped: { path: resolvedRoot, reason: topLevelReadError },
		};
	}
	return {
		projects: [...projects].map((path) => ({ path, root: resolvedRoot })),
		skipped: null,
	};
}

export async function scanImportCandidates(
	root: string,
	maxDepth: number,
	isIgnoredDirectory: (name: string) => boolean,
	existingProjectPaths: ReadonlySet<string>
): Promise<CandidateScanResult> {
	const resolvedRoot = resolve(root);
	if (!(await directoryExists(resolvedRoot))) {
		return {
			candidates: [],
			skipped: {
				path: resolvedRoot,
				reason: 'Configured root does not exist or is not a directory',
			},
		};
	}
	const candidates = new Map<string, ProjectImportCandidateDto>();
	let topLevelReadError: null | string = null;
	async function visit(path: string, containingRoot: string, depth: number): Promise<void> {
		let entries: {
			isDirectory(): boolean;
			isFile(): boolean;
			isSymbolicLink(): boolean;
			name: string;
		}[];
		try {
			entries = await readdir(path, { withFileTypes: true });
		} catch (err) {
			if (path === resolvedRoot) {
				topLevelReadError =
					err instanceof Error ? err.message : 'Failed to read configured root';
			}
			return;
		}
		const names = new Set(entries.map((entry) => entry.name));
		const signals = {
			aidd: names.has('.aidd') && (await directoryExists(join(path, '.aidd'))),
			git: names.has('.git') && (await directoryExists(join(path, '.git'))),
			packageJson:
				names.has('package.json') && (await fileExists(join(path, 'package.json'))),
		};
		const isRoot = path === resolvedRoot;
		const resolvedPath = resolve(path);
		if (!isRoot && (signals.git || signals.packageJson || signals.aidd)) {
			if (signals.aidd || existingProjectPaths.has(resolvedPath)) {
				return;
			}
			candidates.set(resolvedPath, {
				canImport: true,
				id: encodeProjectId(resolvedPath),
				name: basename(resolvedPath),
				path: resolvedPath,
				reason: null,
				root: containingRoot,
				signals,
			});
		}
		if (depth >= maxDepth) return;
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.isSymbolicLink() || isIgnoredDirectory(entry.name)) {
				continue;
			}
			await visit(join(path, entry.name), containingRoot, depth + 1);
		}
	}
	await visit(resolvedRoot, resolvedRoot, 0);
	if (topLevelReadError && candidates.size === 0) {
		return {
			candidates: [],
			skipped: { path: resolvedRoot, reason: topLevelReadError },
		};
	}
	// A candidate whose direct children are themselves projects (other candidates or
	// already-managed projects) is a monorepo root, not an importable project —
	// ingesting it as one umbrella project would be wrong. Surface it, but blocked,
	// with guidance toward per-subproject intake.
	const projectPaths = new Set([...candidates.keys(), ...existingProjectPaths]);
	for (const candidate of candidates.values()) {
		let childProjects = 0;
		for (const other of projectPaths) {
			if (other !== candidate.path && dirname(other) === candidate.path) childProjects += 1;
		}
		if (childProjects >= 2) {
			candidate.canImport = false;
			candidate.reason = `Monorepo root containing ${childProjects} projects — ingest subprojects individually`;
		}
	}
	return {
		candidates: [...candidates.values()].sort((left, right) =>
			left.path.localeCompare(right.path)
		),
		skipped: null,
	};
}

export function dedupeSkippedRoots(
	skippedRoots: ProjectDiscoverySkippedRootDto[]
): ProjectDiscoverySkippedRootDto[] {
	const seen = new Set<string>();
	const deduped: ProjectDiscoverySkippedRootDto[] = [];
	for (const root of skippedRoots) {
		const key = `${root.path}\n${root.reason}`;
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(root);
	}
	return deduped;
}

export function chooseProjectRoot(
	existing: { path: string; root: string } | undefined,
	candidate: { path: string; root: string }
): { path: string; root: string } {
	if (!existing) return candidate;
	if (candidate.root.length > existing.root.length) return candidate;
	if (candidate.root.length < existing.root.length) return existing;
	return candidate.root.localeCompare(existing.root) < 0 ? candidate : existing;
}
