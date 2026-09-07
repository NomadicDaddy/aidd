/**
 * Resolves third-party license data from the installed dependency graph.
 *
 * Two sets are collected:
 * - Direct production dependencies (the set a downloader resolves with `bun install`, and the
 *   subset bundled into frontend/dist), enumerated with version + license.
 * - The full installed graph, summarized as a license distribution, so a
 *   non-permissive license appearing anywhere in the tree is visible.
 *
 * Workspace-internal packages are excluded from both: they are first-party.
 */

import { join } from 'node:path';

import { licenseOf, readJson, workspaceNames } from '../license-core/manifest.ts';

export { licenseOf, workspaceNames } from '../license-core/manifest.ts';

export interface DirectDependency {
	license: string;
	name: string;
	version: string;
	workspace: string;
}

export interface GraphSummary {
	distribution: { count: number; license: string }[];
	flagged: { license: string; name: string }[];
	uniqueNames: number;
	uniqueVersions: number;
}

async function resolveInstalled(
	root: string,
	workspaces: string[],
	name: string,
): Promise<null | Record<string, unknown>> {
	const candidates = [
		join(root, 'node_modules', name, 'package.json'),
		...workspaces.map((workspace) =>
			join(root, workspace, 'node_modules', name, 'package.json'),
		),
	];
	for (const candidate of candidates) {
		const pkg = await readJson(candidate);
		if (pkg) return pkg;
	}
	return null;
}

export async function collectDirectDependencies(
	root: string,
	workspaces: string[],
): Promise<{ dependencies: DirectDependency[]; unresolved: string[] }> {
	const internal = await workspaceNames(root, workspaces);
	const dependencies: DirectDependency[] = [];
	const unresolved: string[] = [];
	const seen = new Set<string>();

	for (const workspace of ['', ...workspaces]) {
		const manifest = await readJson(join(root, workspace, 'package.json'));
		const deps = manifest?.dependencies;
		if (typeof deps !== 'object' || deps === null) continue;

		for (const name of Object.keys(deps).sort()) {
			if (internal.has(name)) continue;
			const key = `${workspace}:${name}`;
			if (seen.has(key)) continue;
			seen.add(key);

			const installed = await resolveInstalled(root, workspaces, name);
			if (!installed) {
				unresolved.push(`${workspace || '.'}: ${name}`);
				continue;
			}
			dependencies.push({
				license: licenseOf(installed),
				name,
				version: String(installed.version ?? '?'),
				workspace: workspace || '.',
			});
		}
	}

	return { dependencies, unresolved };
}
