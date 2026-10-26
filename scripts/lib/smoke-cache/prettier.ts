import { readdir, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { walkCacheFiles } from './walk.ts';

const PRETTIER_CANDIDATE_GLOBS = [
	'**/*.cjs',
	'**/*.css',
	'**/*.html',
	'**/*.js',
	'**/*.json',
	'**/*.jsonc',
	'**/*.jsx',
	'**/*.md',
	'**/*.mdx',
	'**/*.mjs',
	'**/*.svg',
	'**/*.toml',
	'**/*.ts',
	'**/*.tsx',
	'**/*.webmanifest',
	'**/*.yaml',
	'**/*.yml',
];

const IGNORED_SEGMENTS = new Set([
	'.git',
	'coverage',
	'data',
	'dist',
	'logs',
	'node_modules',
	'screenshots',
]);

function isIgnored(relativePath: string): boolean {
	const normalized = relativePath.split(sep).join('/');
	return normalized.split('/').some((segment) => IGNORED_SEGMENTS.has(segment));
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return false;
		throw err;
	}
}

/**
 * The visible walk skips dot paths. Probe each hidden root against Prettier's ignore policy
 * before walking it, so .github remains an input while ignored agent/runtime trees stay out.
 * The walker also prunes dependency and generated directories before entering them.
 */
async function collectHiddenCandidates(projectRoot: string): Promise<string[]> {
	const { getFileInfo } = await import('prettier');
	const candidates: string[] = [];

	for (const entry of await readdir(projectRoot, { withFileTypes: true })) {
		if (!entry.isDirectory() || !entry.name.startsWith('.')) continue;
		if (IGNORED_SEGMENTS.has(entry.name)) continue;

		const probe = await getFileInfo(resolve(projectRoot, entry.name, 'probe.md'), {
			ignorePath: resolve(projectRoot, '.prettierignore'),
		});
		if (probe.ignored) continue;

		candidates.push(...(await walkCacheFiles(projectRoot, entry.name, true, isIgnored)));
	}

	return candidates;
}

async function collectVisibleCandidates(projectRoot: string): Promise<string[]> {
	const globs = PRETTIER_CANDIDATE_GLOBS.map((pattern) => new Bun.Glob(pattern));
	const candidates = await walkCacheFiles(projectRoot, '', false, isIgnored);
	return candidates.filter((path) => globs.some((glob) => glob.match(path)));
}

export async function collectPrettierDependencies(
	projectRoot: string,
	toolInputs: string[],
): Promise<string[]> {
	const { getFileInfo } = await import('prettier');
	const files = new Set<string>();

	for (const input of toolInputs) {
		if (await pathExists(resolve(projectRoot, input))) files.add(input);
	}

	const candidates = [
		...(await collectVisibleCandidates(projectRoot)),
		...(await collectHiddenCandidates(projectRoot)),
	];

	for (const normalized of candidates) {
		if (isIgnored(normalized)) continue;

		const info = await getFileInfo(resolve(projectRoot, normalized), {
			ignorePath: resolve(projectRoot, '.prettierignore'),
			withNodeModules: false,
		});
		if (!info.ignored && info.inferredParser !== null) files.add(normalized);
	}

	return [...files].sort();
}
