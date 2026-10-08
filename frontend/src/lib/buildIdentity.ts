/**
 * The identity of the bundle running in this tab.
 *
 * Vite inlines `__AIDD_*` at build time, so nothing outside the bundle can read them — which is why
 * a crawl report could claim p75 compliance without naming the build it measured. Publishing them on
 * `window` lets the Web Vitals crawler stamp every report with the artifact it actually exercised,
 * and lets the analyzer refuse a report taken against a different build than the one on disk.
 */
export interface AiddBuildIdentity {
	/** Vite's mode: `production` for a built artifact, `development` for the dev server. */
	mode: string;
	/** Short Git revision the bundle was built from. */
	revision: string;
	/** ISO timestamp of the build. */
	timestamp: string;
	/** Package version. */
	version: string;
}

declare global {
	interface Window {
		__AIDD_BUILD_IDENTITY__?: AiddBuildIdentity;
	}
}

// Declared here as well as in frontend/src/types/build-constants.d.ts: the root tsc program reaches
// this module through the web-vitals tests without the frontend's ambient declarations or Vite's
// client types, and it must still type-check there.
declare const __AIDD_BUILD_REVISION__: string;
declare const __AIDD_VERSION__: string;

/** The meta tag vite.config.ts injects into index.html; the one per-build value outside the chunks. */
export const BUILD_TIMESTAMP_META = 'aidd-build-timestamp';

/**
 * When this bundle was built, read from the entry document rather than compiled in: a timestamp
 * inside a content-hashed chunk renamed the entry and most of the bundle on every rebuild.
 * @returns The ISO timestamp, or `unknown` when the document carries none (tests, a bare module).
 */
export function buildTimestamp(): string {
	if (typeof document === 'undefined') return 'unknown';
	const content = document
		.querySelector(`meta[name="${BUILD_TIMESTAMP_META}"]`)
		?.getAttribute('content');
	return content && content.length > 0 ? content : 'unknown';
}

/** The build constants Vite inlined into this bundle, plus the timestamp from the document. */
export function buildIdentity(): AiddBuildIdentity {
	const env: Record<string, string | undefined> = import.meta.env;
	return {
		mode: env.MODE ?? 'unknown',
		revision: __AIDD_BUILD_REVISION__,
		timestamp: buildTimestamp(),
		version: __AIDD_VERSION__,
	};
}

/** Expose the identity to automation. Best-effort: a frozen or absent window is not an error. */
export function publishBuildIdentity(): void {
	try {
		window.__AIDD_BUILD_IDENTITY__ = buildIdentity();
	} catch {
		// Nothing to report against — the collector still works.
	}
}
