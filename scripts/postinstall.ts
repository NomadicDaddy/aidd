#!/usr/bin/env bun
/**
 * Build the web control panel after `bun install` resolves dependencies.
 *
 * aidd ships as source. The release artifact is a GitHub-generated archive of the tag and
 * `frontend/dist/` is gitignored, so a fresh checkout has no built panel. The documented path is
 * `bun install` then `bun run start:web`, and neither start command builds; without this lifecycle
 * step the backend comes up able only to report that the UI is unavailable.
 *
 * Skips, without failing the install, when the opt-out variable is set (CI and the release
 * workflow build explicitly), when the frontend workspace is absent, and when the existing build
 * is already complete and newer than every input.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cwd, exit, env as processEnv } from 'node:process';
import { parseArgs } from 'node:util';

/** Set to any non-empty value to leave `frontend/dist/` alone. */
export const SKIP_BUILD_ENV = 'AIDD_SKIP_POSTINSTALL_BUILD';

/** Inputs that invalidate a build without living under `frontend/src`. */
const EXTRA_BUILD_INPUTS = ['index.html', 'package.json', 'tsconfig.json', 'vite.config.ts'];

export interface PostinstallDeps {
	env: Record<string, string | undefined>;
	runBuild: (root: string) => { message: string; ok: boolean };
}

function newestMtime(path: string): number {
	let stats;
	try {
		stats = statSync(path);
	} catch {
		return 0;
	}
	if (!stats.isDirectory()) return stats.mtimeMs;

	let newest = stats.mtimeMs;
	for (const entry of readdirSync(path, { withFileTypes: true })) {
		newest = Math.max(newest, newestMtime(join(path, entry.name)));
	}
	return newest;
}

/**
 * Local files `index.html` points at that are not on disk.
 *
 * A build that emitted an entry chunk and then failed leaves an index referencing assets that were
 * never written, which looks identical to a good build until the browser 404s.
 */
export function findMissingDistAssets(distDir: string): string[] {
	const indexPath = join(distDir, 'index.html');
	if (!existsSync(indexPath)) return ['index.html'];

	const html = readFileSync(indexPath, 'utf8');
	const missing: string[] = [];
	for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
		const reference = match[1]!;
		if (!reference.startsWith('/') && !reference.startsWith('./')) continue;
		const relativePath = reference.split(/[#?]/)[0]!.replace(/^\.?\//, '');
		if (relativePath === '') continue;
		if (!existsSync(join(distDir, relativePath))) missing.push(relativePath);
	}
	return missing;
}

export interface PostinstallDecision {
	reason: string;
	skip: boolean;
}

/** Whether this install has to build, and the one-line reason either way. */
export function decidePostinstall(
	root: string,
	env: Record<string, string | undefined>,
): PostinstallDecision {
	if ((env[SKIP_BUILD_ENV] ?? '') !== '') {
		return { reason: `${SKIP_BUILD_ENV} is set`, skip: true };
	}

	const frontendDir = join(root, 'frontend');
	if (!existsSync(join(frontendDir, 'package.json'))) {
		return { reason: 'no frontend workspace in this tree', skip: true };
	}

	const distDir = join(frontendDir, 'dist');
	const missing = findMissingDistAssets(distDir);
	if (missing.length > 0) {
		return { reason: `frontend/dist is missing ${missing.join(', ')}`, skip: false };
	}

	const built = statSync(join(distDir, 'index.html')).mtimeMs;
	const inputs = [
		newestMtime(join(frontendDir, 'src')),
		...EXTRA_BUILD_INPUTS.map((name) => newestMtime(join(frontendDir, name))),
	];
	// Ties rebuild. Windows stamps mtimes on a ~15.6 ms tick, so an edit made in the same tick as
	// the build it invalidated compares equal, and the cheap answer there is to build again.
	if (Math.max(...inputs) >= built) {
		return { reason: 'frontend sources are newer than frontend/dist', skip: false };
	}

	return { reason: 'frontend/dist is complete and current', skip: true };
}

function spawnBuild(root: string): { message: string; ok: boolean } {
	try {
		const result = Bun.spawnSync(['bun', 'run', 'build:frontend'], {
			cwd: root,
			stderr: 'inherit',
			stdout: 'inherit',
			windowsHide: true,
		});
		return result.exitCode === 0
			? { message: 'build:frontend succeeded', ok: true }
			: { message: `build:frontend exited ${result.exitCode}`, ok: false };
	} catch (err) {
		// Bun.spawnSync throws rather than exiting non-zero when the binary is absent.
		return { message: err instanceof Error ? err.message : String(err), ok: false };
	}
}

export function runPostinstall(root: string = cwd(), deps: Partial<PostinstallDeps> = {}): number {
	const env = deps.env ?? processEnv;
	const runBuild = deps.runBuild ?? spawnBuild;
	const decision = decidePostinstall(root, env);
	if (decision.skip) {
		console.log(`[SKIP] postinstall frontend build -- ${decision.reason}.`);
		return 0;
	}

	console.log(`[OK] postinstall frontend build -- ${decision.reason}; building.`);
	const build = runBuild(root);
	if (!build.ok) {
		console.error(`[FAIL] postinstall frontend build -- ${build.message}.`);
		console.error(`[FAIL] Run "bun run build:frontend" or set ${SKIP_BUILD_ENV}=1 to skip.`);
		return 1;
	}

	const missing = findMissingDistAssets(join(root, 'frontend', 'dist'));
	if (missing.length > 0) {
		console.error(
			`[FAIL] postinstall frontend build -- frontend/dist is missing ${missing.join(', ')}.`,
		);
		return 1;
	}

	console.log('[OK] postinstall frontend build -- frontend/dist is complete.');
	return 0;
}

if (import.meta.main) {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: { root: { type: 'string' } },
		strict: true,
	});
	exit(runPostinstall(values.root === undefined ? cwd() : resolve(values.root)));
}
