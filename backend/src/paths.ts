import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { basename, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

import { HttpError } from './services/errors.ts';

const PROJECT_ROUTE_HASH_MIN_LENGTH = 8;
const CANONICAL_PATH_CACHE_LIMIT = 512;

/** Canonical spellings of paths whose every segment was found on disk, keyed case-insensitively. */
const canonicalPathCache = new Map<string, string>();

function onDiskName(directory: string, segment: string): null | string {
	let entries: string[];
	try {
		entries = readdirSync(directory);
	} catch {
		return null;
	}
	const wanted = segment.toLowerCase();
	return entries.find((entry) => entry.toLowerCase() === wanted) ?? null;
}

function canonicalWindowsPath(resolved: string): { onDisk: boolean; value: string } {
	const { root } = parse(resolved);
	const segments = resolved
		.slice(root.length)
		.split(sep)
		.filter((segment) => segment.length > 0);
	let value = root.toLowerCase();
	let onDisk = true;
	for (const segment of segments) {
		const name = onDisk ? onDiskName(value, segment) : null;
		if (name === null) onDisk = false;
		value = join(value, name ?? segment.toLowerCase());
	}
	return { onDisk, value };
}

/**
 * The one spelling a project path has in stored run, session, and invocation rows, and so in the
 * project ids derived from those rows. On every platform the path is resolved; on Windows, where
 * the file system ignores case but string comparison does not, the drive letter is lowercased and
 * each segment takes its on-disk casing, so a run launched from a shell whose cwd reads
 * `D:\apps\Proj` and one launched by the panel from `d:\apps\Proj` share one value. Segments that
 * do not exist on disk are lowercased so a missing directory still maps two spellings to one
 * value. Symbolic links and junctions are not resolved.
 * @param path
 * @returns The canonical absolute path.
 */
export function canonicalProjectPath(path: string): string {
	const resolved = resolve(path);
	if (process.platform !== 'win32') return resolved;
	const key = resolved.toLowerCase();
	const cached = canonicalPathCache.get(key);
	if (cached !== undefined) return cached;
	const { onDisk, value } = canonicalWindowsPath(resolved);
	if (onDisk) {
		if (canonicalPathCache.size >= CANONICAL_PATH_CACHE_LIMIT) canonicalPathCache.clear();
		canonicalPathCache.set(key, value);
	}
	return value;
}

function projectIdentityPath(path: string): string {
	const canonical = canonicalProjectPath(path);
	return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
}

function projectRouteHash(path: string): string {
	return createHash('sha256').update(projectIdentityPath(path)).digest('hex');
}

function projectSlugKey(path: string): string {
	const slug = basename(resolve(path));
	return process.platform === 'win32' ? slug.toLowerCase() : slug;
}

export function buildProjectRouteIds(paths: string[]): Map<string, string> {
	const resolvedPaths = [...new Set(paths.map((path) => resolve(path)))];
	const groups = new Map<string, string[]>();
	for (const path of resolvedPaths) {
		const key = projectSlugKey(path);
		groups.set(key, [...(groups.get(key) ?? []), path]);
	}
	const routeIds = new Map<string, string>();
	for (const group of groups.values()) {
		if (group.length === 1) {
			const path = group[0]!;
			routeIds.set(path, basename(path));
			continue;
		}
		const hashes = group.map((path) => ({ hash: projectRouteHash(path), path }));
		let length = PROJECT_ROUTE_HASH_MIN_LENGTH;
		while (new Set(hashes.map(({ hash }) => hash.slice(0, length))).size < hashes.length) {
			length += 2;
		}
		for (const { hash, path } of hashes) {
			routeIds.set(path, `${basename(path)}~${hash.slice(0, length)}`);
		}
	}
	return routeIds;
}

export function matchesProjectRouteDisambiguator(path: string, value: string): boolean {
	return (
		value.length >= PROJECT_ROUTE_HASH_MIN_LENGTH && projectRouteHash(path).startsWith(value)
	);
}

export function encodeProjectId(path: string): string {
	return Buffer.from(resolve(path)).toString('base64url');
}

export function decodeProjectId(id: string): string {
	if (id.length === 0 || !/^[A-Za-z0-9_-]+={0,2}$/.test(id)) {
		throw new Error(`Invalid project ID: ${id}`);
	}
	return Buffer.from(id, 'base64url').toString('utf8');
}

export function pathIsInside(parent: string, candidate: string): boolean {
	const resolvedParent = resolve(parent);
	const resolvedCandidate = resolve(candidate);
	const relation = relative(resolvedParent, resolvedCandidate);
	if (relation === '') return true;
	// On Windows, path.relative() returns an absolute path when parent and candidate are on
	// different drives (e.g. relative('C:\\foo','D:\\bar') === 'D:\\bar'). An absolute result
	// means the candidate is NOT inside the parent, so reject it here. Without this guard the
	// cross-drive result slipped past the ".." prefix checks below.
	if (isAbsolute(relation)) return false;
	return !relation.startsWith('..') && !relation.startsWith('..\\');
}

export function assertAllowedPath(allowedRoots: string[], candidate: string): string {
	const resolved = resolve(candidate);
	if (!allowedRoots.some((root) => pathIsInside(root, resolved))) {
		throw new HttpError(`Path is outside allowed roots: ${candidate}`, 400);
	}
	return resolved;
}
