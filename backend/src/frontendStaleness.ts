import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { webLogger } from './logger.ts';

/**
 * The web backend serves the prebuilt frontend from `frontend/dist` (read from disk per request)
 * and no start path rebuilds it: `start:web` and `backend start` both run from
 * source via Bun without invoking `build:frontend`. So when frontend source changes and only the
 * server is restarted, the stale prebuilt dist is served and the change silently does not take
 * effect. This guard detects that staleness at startup and surfaces it loudly.
 *
 * A deployment that carries only `frontend/dist` and no `frontend/src` has nothing to compare
 * against, so the absence of `frontend/src` is the discriminator for the production path — there
 * the dist is intentionally prebuilt and the guard stays silent.
 */
export type FrontendStalenessResult =
	| { distBuiltAt: Date; distDir: string; srcDir: string; srcModifiedAt: Date; status: 'stale' }
	| { distDir: string; status: 'missing' }
	| { status: 'fresh' }
	| { status: 'production' };

/** Recursively find the newest file mtime (ms) under `dir`; returns 0 when no files exist. */
async function newestMtimeMs(dir: string): Promise<number> {
	let newest = 0;
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			const childNewest = await newestMtimeMs(full);
			if (childNewest > newest) newest = childNewest;
			continue;
		}
		try {
			const info = await stat(full);
			if (info.mtimeMs > newest) newest = info.mtimeMs;
		} catch {
			// Best-effort: a file removed mid-walk just doesn't contribute to the max.
		}
	}
	return newest;
}

/**
 * Compare the served `frontend/dist` against the `frontend/src` tree to decide whether the dist a
 * restart would serve is stale. Does no I/O beyond stat/readdir and never rebuilds.
 */
export async function evaluateFrontendStaleness(rootDir: string): Promise<FrontendStalenessResult> {
	const frontendDir = join(rootDir, 'frontend');
	const srcDir = join(frontendDir, 'src');
	const distDir = join(frontendDir, 'dist');

	// No source tree means there is nothing to compare against: the dist is prebuilt and intended.
	if (!existsSync(srcDir)) return { status: 'production' };

	if (!existsSync(join(distDir, 'index.html'))) return { distDir, status: 'missing' };

	const [srcNewest, distNewest] = await Promise.all([
		newestMtimeMs(srcDir),
		newestMtimeMs(distDir),
	]);

	if (srcNewest > distNewest) {
		return {
			distBuiltAt: new Date(distNewest),
			distDir,
			srcDir,
			srcModifiedAt: new Date(srcNewest),
			status: 'stale',
		};
	}
	return { status: 'fresh' };
}

/**
 * Evaluate frontend staleness and, when the served dist is missing or older than source, emit a
 * loud, visible startup warning (both structured via pino and on the console) instructing how to
 * rebuild. Silent on the fresh and production paths.
 */
export async function warnIfFrontendStale(rootDir: string): Promise<FrontendStalenessResult> {
	const result = await evaluateFrontendStaleness(rootDir);
	if (result.status === 'missing') {
		webLogger.warn(
			{ distDir: result.distDir },
			'frontend/dist is missing — the web UI cannot be served until it is built',
		);
		console.warn(
			'⚠ WARNING: frontend/dist is missing — the web UI cannot be served until you build it:\n' +
				'    bun run build:frontend',
		);
	} else if (result.status === 'stale') {
		webLogger.warn(
			{
				distBuiltAt: result.distBuiltAt.toISOString(),
				distDir: result.distDir,
				srcDir: result.srcDir,
				srcModifiedAt: result.srcModifiedAt.toISOString(),
			},
			'served frontend/dist is stale (older than frontend/src) — rebuild with `bun run build:frontend`',
		);
		console.warn(
			'⚠ WARNING: the served frontend (frontend/dist) is STALE — it is older than frontend/src.\n' +
				'  The browser UI will NOT reflect recent frontend changes until you rebuild:\n' +
				'    bun run build:frontend\n' +
				`  (dist built ${result.distBuiltAt.toISOString()}, newest source change ${result.srcModifiedAt.toISOString()})`,
		);
	}
	return result;
}
