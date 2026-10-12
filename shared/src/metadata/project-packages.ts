import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { projectPackageManifestPaths, readProjectPackage } from './project-stack-evidence.ts';

// Deep enough for `frontend/package.json` and `apps/web/package.json`; anything deeper is a
// vendored or generated tree rather than the project's own code.
const MAX_DEPTH = 2;
const skippedDirs = new Set(['build', 'coverage', 'dist', 'node_modules', 'out', 'vendor']);

async function nestedManifestPaths(dir: string, depth: number, found: string[]): Promise<void> {
	if (depth > MAX_DEPTH) return;
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index]!;
		const path = join(dir, entry.name);
		if (entry.isFile() && entry.name === 'package.json' && depth > 0) found.push(path);
		const walkable =
			entry.isDirectory() &&
			!entry.isSymbolicLink() &&
			!entry.name.startsWith('.') &&
			!skippedDirs.has(entry.name);
		if (walkable) await nestedManifestPaths(path, depth + 1, found);
	}
}

function dependencyKeys(value: unknown): string[] {
	return value !== null && typeof value === 'object' ? Object.keys(value) : [];
}

/**
 * Every package a project's own manifests depend on, each with the manifest that first declares
 * it, for package-scoped and surface-scoped audit applicability. Reads the root manifest and its
 * declared workspaces, plus any manifest up to two directories down: a React frontend kept in
 * `frontend/` without a workspaces entry still counts, where the stack detector alone would miss
 * it. The manifest path is relative to the project and is there so a decision can name its
 * evidence.
 */
export async function projectDependencySources(projectDir: string): Promise<Map<string, string>> {
	const paths = await projectPackageManifestPaths(projectDir);
	const nested: string[] = [];
	await nestedManifestPaths(projectDir, 0, nested);
	const all = new Set([...paths, ...nested]);
	const sources = new Map<string, string>();
	for (const path of all) {
		const manifest = await readProjectPackage(path);
		if (!manifest) continue;
		const keys = [
			...dependencyKeys(manifest.dependencies),
			...dependencyKeys(manifest.devDependencies),
		];
		const manifestPath = relative(projectDir, path).replace(/\\/g, '/');
		for (let index = 0; index < keys.length; index++) {
			const name = keys[index]!;
			if (!sources.has(name)) sources.set(name, manifestPath);
		}
	}
	return sources;
}
