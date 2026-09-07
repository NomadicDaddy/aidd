import { readdir, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

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
 * Bun.Glob will not descend into hidden directories unless `dot: true`, so a plain `**` scan
 * cannot see `.github/**` — which `prettier --check .` very much does check. Enabling `dot`
 * for the whole tree is not the fix: it also walks node_modules' dotfiles and makes the scan
 * roughly ten times slower, which the pre-commit inner loop pays on every run.
 *
 * Hidden directories are therefore walked one at a time. Any that .prettierignore already
 * covers (.aidd, .claude, .vscode) is skipped as a whole via a single probe instead of being
 * enumerated and rejected file by file.
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

		const glob = new Bun.Glob('**/*');
		for await (const relativePath of glob.scan({
			cwd: resolve(projectRoot, entry.name),
			dot: true,
			onlyFiles: true,
		})) {
			candidates.push(`${entry.name}/${relativePath.split(sep).join('/')}`);
		}
	}

	return candidates;
}

async function collectVisibleCandidates(projectRoot: string): Promise<string[]> {
	const candidates: string[] = [];

	for (const pattern of PRETTIER_CANDIDATE_GLOBS) {
		const glob = new Bun.Glob(pattern);
		for await (const relativePath of glob.scan({ cwd: projectRoot, onlyFiles: true })) {
			candidates.push(relativePath.split(sep).join('/'));
		}
	}

	return candidates;
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
