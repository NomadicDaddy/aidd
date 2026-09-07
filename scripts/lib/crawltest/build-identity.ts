import type { Page } from 'puppeteer';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CrawlBuildIdentity } from '../../crawltest-types.ts';

/**
 * Every same-origin `<script src>` / `<link href>` in an index.html, sorted.
 *
 * Vite content-hashes bundle filenames, so this set is the build's fingerprint. It is taken over
 * the tags rather than the whole document because the panel injects an `aidd-trace-default` meta
 * element as it serves index.html — hashing the served bytes would never match the file on disk.
 * Absolute URLs are excluded: a third-party font does not identify this build.
 * @param html The index document.
 * @returns The referenced asset paths, deduplicated and sorted.
 */
export function indexAssetReferences(html: string): string[] {
	const references = new Set<string>();
	for (const match of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/gi)) {
		const reference = match[1];
		if (!reference) continue;
		if (/^(?:[a-z]+:)?\/\//i.test(reference) || reference.startsWith('data:')) continue;
		references.add(reference);
	}
	return [...references].sort();
}

/**
 * SHA-256 over an index document's asset references.
 * @param html The index document.
 * @returns The hex digest, or null when the document references no local assets at all.
 */
export function productionIndexHash(html: string): null | string {
	const references = indexAssetReferences(html);
	if (references.length === 0) return null;
	return createHash('sha256').update(references.join('\n')).digest('hex');
}

/**
 * The hash of the production artifact on disk, which is what a crawl is supposed to have exercised.
 * @param rootDir Repository root.
 * @returns The hex digest, or null when there is no built frontend to compare against.
 */
export function distIndexHash(rootDir: string): null | string {
	const indexPath = join(rootDir, 'frontend', 'dist', 'index.html');
	if (!existsSync(indexPath)) return null;
	return productionIndexHash(readFileSync(indexPath, 'utf8'));
}

/**
 * Read the identity of the build the crawler is driving: the constants the bundle published on
 * `window`, plus the origin and a hash of the index document that origin actually served.
 * @param page An open page on the target origin.
 * @param baseUrl The crawl's base URL.
 * @returns The identity, or null when the served bundle publishes none (an old or foreign build).
 */
export async function captureBuildIdentity(
	page: Page,
	baseUrl: string,
): Promise<CrawlBuildIdentity | null> {
	const raw = await page.evaluate(
		`(() => JSON.stringify(window.__AIDD_BUILD_IDENTITY__ ?? null))()`,
	);
	if (typeof raw !== 'string') return null;
	const published = JSON.parse(raw) as null | Partial<CrawlBuildIdentity>;
	if (!published || typeof published.revision !== 'string') return null;

	const origin = new URL(baseUrl).origin;
	const response = await fetch(new URL('/', origin));
	const indexHash = response.ok ? productionIndexHash(await response.text()) : null;

	return {
		indexHash,
		mode: typeof published.mode === 'string' ? published.mode : 'unknown',
		origin,
		revision: published.revision,
		timestamp: typeof published.timestamp === 'string' ? published.timestamp : 'unknown',
		version: typeof published.version === 'string' ? published.version : 'unknown',
	};
}

/**
 * Whether a crawl report describes the production build on disk.
 *
 * A p75 claim is only about the artifact that was measured, so a report that names no build, or
 * names a different one, is not evidence about this one.
 * @param recorded The identity stored in the report.
 * @param expectedIndexHash The hash of `frontend/dist/index.html`, or null when it is absent.
 * @returns Human-readable failures; empty when the report covers the artifact on disk.
 */
export function compareBuildIdentity(
	recorded: CrawlBuildIdentity | null,
	expectedIndexHash: null | string,
): string[] {
	if (!recorded) {
		return [
			'build identity: the report records none, so it cannot be attributed to a build. ' +
				'Re-run crawltest against a frontend built from this checkout.',
		];
	}
	if (recorded.mode !== 'production') {
		return [
			`build identity: crawled a "${recorded.mode}" build at ${recorded.origin}; only a ` +
				'production build can substantiate p75 compliance.',
		];
	}
	if (expectedIndexHash === null) {
		return [
			'build identity: frontend/dist/index.html is missing, so the report cannot be ' +
				'checked against the production artifact.',
		];
	}
	if (recorded.indexHash !== expectedIndexHash) {
		return [
			`build identity: report covers index ${recorded.indexHash ?? 'unknown'} but ` +
				`frontend/dist is ${expectedIndexHash}. The measured build is not the built one.`,
		];
	}
	return [];
}
