import fs from 'node:fs';
import path from 'node:path';

import { APPLICATIONS_ROOT } from './constants.ts';
import { type DiscoveredApp } from './types.ts';

function isDirectory(target: string): boolean {
	return fs.existsSync(target) && fs.statSync(target).isDirectory();
}

/** A linked git worktree: its `.git` is a file that points at the repository, not a folder. */
function isLinkedWorktree(root: string): boolean {
	const gitEntry = path.join(root, '.git');
	return fs.existsSync(gitEntry) && !isDirectory(gitEntry);
}

function wanted(name: string, filterApps: null | Set<string>): boolean {
	return !name.includes('.old') && (filterApps === null || filterApps.has(name));
}

/**
 * The applications to sweep: every folder directly under the applications root that carries
 * `.aidd/features`, named by its folder. The sweep used to read a table of names and locations
 * from the workspace instruction file; that table was removed from the file, and the sweep then
 * found nothing at all. The folders themselves are the same list and cannot go out of date.
 *
 * Left out: a `.old` folder, and a linked git worktree, which is a second checkout of a repository
 * the walk already lists under its own name.
 */
export function discoverApps(
	filterApps: null | Set<string>,
	applicationsRoot: string = APPLICATIONS_ROOT,
): DiscoveredApp[] {
	return fs
		.readdirSync(applicationsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && wanted(entry.name, filterApps))
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right))
		.map((name) => {
			const root = path.join(applicationsRoot, name);
			return { featuresDir: path.join(root, '.aidd', 'features'), name, root };
		})
		.filter((app) => isDirectory(app.featuresDir) && !isLinkedWorktree(app.root));
}
