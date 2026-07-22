import type { ResolvedWebConfig } from 'aidd-shared/config';

import { parseGithubTemplateSource } from 'aidd-shared/git/degit';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
import { fileExists } from './discovery.ts';

// Marker file recording which repo#ref a cached clone was created from, so the cache is rebuilt when
// web.spernakitTemplateRepo/Ref changes instead of silently serving a stale template.
const SOURCE_MARKER = '.aidd-template-source';

function sourceId(config: ResolvedWebConfig): string {
	return `${config.spernakitTemplateRepo}#${config.spernakitTemplateRef ?? ''}`;
}

// A checkout is usable when it contains the portable generator.
async function hasGenerator(root: string): Promise<boolean> {
	return fileExists(join(root, 'scripts', 'init.ts'));
}

async function readMarker(path: string): Promise<null | string> {
	try {
		return (await readFile(path, 'utf8')).trim();
	} catch {
		return null;
	}
}

// Full clone (keeps .git so later template-diff tooling can resolve version tags) of the configured
// template repo into the cache. Bun.spawn is wrapped because it throws ENOENT (not a non-zero exit)
// when git is absent.
async function cloneSpernakit(config: ResolvedWebConfig, targetDir: string): Promise<void> {
	const source = parseGithubTemplateSource(config.spernakitTemplateRepo);
	if (!source) {
		throw new HttpError(
			`web.spernakitTemplateRepo is not a valid owner/repo: ${config.spernakitTemplateRepo}`,
			500
		);
	}
	await mkdir(dirname(targetDir), { recursive: true });
	const ref = config.spernakitTemplateRef ?? source.ref;
	const args = ['clone'];
	if (ref) args.push('--branch', ref);
	args.push('--', source.cloneUrl, targetDir);
	let code: number;
	let stderr: string;
	try {
		const proc = Bun.spawn(['git', ...args], {
			stderr: 'pipe',
			stdin: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});
		[stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
	} catch (err) {
		throw new HttpError(
			`Could not run git to clone the Spernakit template (is git installed?): ${
				err instanceof Error ? err.message : String(err)
			}`,
			500
		);
	}
	if (code !== 0) {
		throw new HttpError(
			`Failed to clone Spernakit template ${config.spernakitTemplateRepo}${ref ? `#${ref}` : ''}: ${stderr.trim()}`,
			500
		);
	}
	recordDataMovement({
		category: 'file',
		operation: 'project.create.spernakit-clone',
		status: 'success',
		summary: { ref: ref ?? 'default', repo: config.spernakitTemplateRepo },
		target: targetDir,
	});
}

// Version of the spernakit template checkout aidd would use (configured local checkout, else the
// cached clone), read from its package.json without triggering a clone. Null when no checkout
// exists yet or its package.json has no version.
export async function readSpernakitTemplateVersion(
	config: ResolvedWebConfig
): Promise<null | string> {
	const candidates = config.spernakitInitScript
		? [dirname(config.spernakitInitScript), dirname(dirname(config.spernakitInitScript))]
		: [join(config.dataDir, 'templates', 'spernakit')];
	for (const root of candidates) {
		if (!(await hasGenerator(root))) continue;
		try {
			const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
				version?: unknown;
			};
			return typeof pkg.version === 'string' ? pkg.version : null;
		} catch {
			return null;
		}
	}
	return null;
}

// Resolve a usable Spernakit checkout (a directory containing scripts/init.ts): the directory of the
// configured init script when set, otherwise a cached clone under <dataDir>/templates/spernakit that
// is created on first use, reused while repo/ref are unchanged, and rebuilt when they change. The
// clone runner is injectable for tests.
export async function ensureSpernakitCheckout(
	config: ResolvedWebConfig,
	clone: (config: ResolvedWebConfig, targetDir: string) => Promise<void> = cloneSpernakit
): Promise<string> {
	if (config.spernakitInitScript) {
		const root = dirname(config.spernakitInitScript);
		if (await hasGenerator(root)) return root;
		// Tolerate spernakitInitScript pointing at scripts/init.ts itself (root is then one level up).
		const up = dirname(root);
		if (await hasGenerator(up)) return up;
		throw new HttpError(
			`Configured spernakitInitScript checkout has no scripts/init.ts (looked in ${root}); update web.spernakitInitScript or clear it to clone the template`,
			500
		);
	}
	const cacheDir = join(config.dataDir, 'templates', 'spernakit');
	const markerPath = join(cacheDir, SOURCE_MARKER);
	const wanted = sourceId(config);
	if (await hasGenerator(cacheDir)) {
		if ((await readMarker(markerPath)) === wanted) return cacheDir;
		// repo/ref changed since this cache was built — discard and re-clone.
		await rm(cacheDir, { force: true, recursive: true });
	}
	await clone(config, cacheDir);
	if (!(await hasGenerator(cacheDir))) {
		throw new HttpError(
			`Cloned Spernakit template at ${cacheDir} is missing scripts/init.ts (repo ${config.spernakitTemplateRepo} may predate the portable initializer)`,
			500
		);
	}
	await writeFile(markerPath, wanted, 'utf8');
	return cacheDir;
}
