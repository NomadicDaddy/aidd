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
declare const __AIDD_BUILD_TIMESTAMP__: string;
declare const __AIDD_VERSION__: string;

/** The build constants Vite inlined into this bundle. */
export function buildIdentity(): AiddBuildIdentity {
	const env: Record<string, string | undefined> = import.meta.env;
	return {
		mode: env.MODE ?? 'unknown',
		revision: __AIDD_BUILD_REVISION__,
		timestamp: __AIDD_BUILD_TIMESTAMP__,
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
