import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { ViewportArg } from './crawltest-types.ts';

export const CRAWL_RESULT_FILE = 'crawl-result.json';

export interface CrawlResultStamp {
	/** Only set once the crawl finishes. */
	screenshots?: number;
	/** Human-readable phase: `started` until the report lands, then `passed` or `failed`. */
	status: string;
	success: boolean;
}

export function getVersionedScreenshotDir(baseDir: string, rootDir: string): string {
	try {
		const manifest = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as {
			version?: unknown;
		};
		if (typeof manifest.version !== 'string' || manifest.version.trim().length === 0) {
			return baseDir;
		}
		return join(baseDir, `v${manifest.version}`);
	} catch {
		return baseDir;
	}
}

/**
 * Records the crawl's verdict beside its screenshots so the pre-push guard can tell a real capture
 * from the wreckage of a failed one — PNG count alone cannot, since a crawl that fails on page 40
 * leaves a directory that looks complete.
 *
 * Written twice: `started` before the first page loads, so a crawl that dies mid-run leaves the
 * directory marked unusable rather than silently passing, then the real verdict once the report is
 * in. The guard treats a missing file as a capture that predates this stamp and falls back to the
 * PNG count, so older directories keep working.
 */
export async function writeCrawlResult(directory: string, stamp: CrawlResultStamp): Promise<void> {
	await mkdir(directory, { recursive: true });
	const payload = { ...stamp, timestamp: new Date().toISOString() };
	await Bun.write(join(directory, CRAWL_RESULT_FILE), `${JSON.stringify(payload, null, '\t')}\n`);
}

export function screenshotFilename(route: string, viewport: ViewportArg): string {
	const routeName = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
	const baseName = routeName.length > 0 ? routeName.toLowerCase() : 'root';
	return viewport === 'desktop' ? `${baseName}.png` : `${viewport}-${baseName}.png`;
}
