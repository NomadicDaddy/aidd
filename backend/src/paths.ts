import { createHash } from 'node:crypto';
import { basename, isAbsolute, relative, resolve } from 'node:path';

const PROJECT_ROUTE_HASH_MIN_LENGTH = 8;

function projectIdentityPath(path: string): string {
	const resolved = resolve(path);
	return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
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
		throw new Error(`Path is outside allowed roots: ${candidate}`);
	}
	return resolved;
}
