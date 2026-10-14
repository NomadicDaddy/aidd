#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exit } from 'node:process';

// Prettier's own cache keys each file on its content plus the Prettier version and the stringified
// options. Plugin code is not in that key, and neither is the stylesheet prettier-plugin-tailwindcss
// reads to order classes (the options carry only its path). A plugin or tailwindcss bump, or a
// class-order edit to frontend/src/*.css, would leave every unchanged file replaying a stale pass.
// The cache location therefore carries a hash of those inputs, so any change starts a cold cache.
const KEYED_FILES = ['bun.lock', '.prettierrc', '.prettierignore'];
const KEYED_GLOB = 'frontend/src/**/*.css';
const CACHE_DIR = 'node_modules/.cache/prettier-runs';

async function readOptional(path: string): Promise<Buffer | null> {
	try {
		return await readFile(path);
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
		throw err;
	}
}

export async function formatCacheKey(projectRoot: string): Promise<string> {
	const styles = await Array.fromAsync(
		new Bun.Glob(KEYED_GLOB).scan({ cwd: projectRoot, onlyFiles: true }),
	);
	const paths = [...KEYED_FILES, ...styles.map((path) => path.replaceAll('\\', '/')).sort()];
	const hash = createHash('sha256');
	for (const path of paths) {
		const bytes = await readOptional(resolve(projectRoot, path));
		hash.update(`${path}\0${bytes === null ? 'missing' : String(bytes.length)}\0`);
		if (bytes !== null) hash.update(bytes);
	}
	return hash.digest('hex').slice(0, 16);
}

export function formatCacheLocation(key: string): string {
	return `${CACHE_DIR}/${key}`;
}

async function pruneStaleCaches(projectRoot: string, key: string): Promise<void> {
	const dir = resolve(projectRoot, CACHE_DIR);
	await mkdir(dir, { recursive: true });
	for (const name of await readdir(dir)) {
		if (name !== key) await rm(resolve(dir, name), { force: true, recursive: true });
	}
}

export async function runFormat(mode: '--check' | '--write', projectRoot: string): Promise<number> {
	const key = await formatCacheKey(projectRoot);
	await pruneStaleCaches(projectRoot, key);
	const child = Bun.spawn(
		[
			process.execPath,
			'x',
			'prettier',
			mode,
			'.',
			'--cache',
			'--cache-location',
			formatCacheLocation(key),
		],
		{
			cwd: projectRoot,
			stderr: 'inherit',
			stdin: 'ignore',
			stdout: 'inherit',
			windowsHide: true,
		},
	);
	return await child.exited;
}

if (import.meta.main) {
	const args = Bun.argv.slice(2);
	const mode = args[0];
	if (args.length !== 1 || (mode !== '--check' && mode !== '--write')) {
		console.error('Usage: bun scripts/run-format.ts --check|--write');
		exit(2);
	}
	exit(await runFormat(mode, resolve(import.meta.dir, '..')));
}
