/**
 * Which markdown files `check-docs` reads: every .md file under the project root that git does not
 * ignore, outside the directories below.
 *
 * Split from check-docs.ts so the gate and `collectDocsInputs`, which tells a cache what the gate
 * reads, find the same files by one rule.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { gitIgnored, toPosixRelative } from './git-ignored.ts';

/** Directories to exclude from scanning, matched by basename at any depth */
const EXCLUDE_DIRS = new Set([
	'.aidd',
	'.claude',
	'.git',
	'.github',
	'backups',
	'coverage',
	'data',
	'dist',
	'logs',
	'node_modules',
	'screenshots',
]);

/**
 * Directories excluded by their path from the project root rather than by basename.
 *
 * These are out of scope, not waived. The distinction matters: a waiver says a known violation is
 * tolerated, and nothing here is a violation of anything. `cli/src/prompts/snapshots/` holds prompt
 * text delivered verbatim to an AI agent, and its links name files in the project being audited.
 * They are not this repository's links and were never meant to resolve here, the same way
 * `node_modules` markdown is not this repository's documentation.
 *
 * Anchored by path because the basename is too common to exclude fleetwide: `snapshots` matched
 * anywhere would silence a real docs directory that happened to share the name.
 */
const EXCLUDE_PATHS = ['cli/src/prompts/snapshots'];

/**
 * Drops the files git ignores. A doc-link checker has no business validating links inside
 * gitignored scratch or vendored trees: they are not shipped, and their markdown is frequently
 * third-party and malformed.
 */
function dropGitIgnored(projectRoot: string, files: string[]): string[] {
	const relatives = files.map((file) => toPosixRelative(projectRoot, file));
	const ignored = gitIgnored(projectRoot, relatives);
	return files.filter((_, index) => !ignored.has(relatives[index]!));
}

/**
 * Recursively discover all .md files under a directory, excluding specified dirs.
 */
function findMarkdownFiles(dir: string, projectRoot: string): string[] {
	const results: string[] = [];

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (EXCLUDE_DIRS.has(entry.name)) continue;
			const full = join(dir, entry.name);
			if (EXCLUDE_PATHS.includes(toPosixRelative(projectRoot, full))) continue;
			results.push(...findMarkdownFiles(full, projectRoot));
		} else if (entry.isFile() && entry.name.endsWith('.md')) {
			results.push(join(dir, entry.name));
		}
	}

	return results;
}

/** Absolute paths of the markdown files the gate checks. */
export function markdownFiles(projectRoot: string): string[] {
	return dropGitIgnored(projectRoot, findMarkdownFiles(projectRoot, projectRoot));
}
