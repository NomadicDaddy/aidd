/**
 * Reading the built frontend: which assets index.html forces the browser to fetch before it can
 * render, what each one actually costs on the wire, and where the React runtime ended up.
 *
 * Extracted from scripts/check-critical-path.ts (max-lines split). Nothing here prints or exits;
 * every function returns its answer to the gate.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The build this gate exists to measure. Overridable so the gate itself can be tested. */
export const DEFAULT_DIST_DIR = join(ROOT_DIR, 'frontend', 'dist');

export function indexHtmlOf(distDir: string): string {
	return join(distDir, 'index.html');
}

/**
 * Must track `compressOnce` in backend/src/staticAssets.ts, which serves this app's static assets.
 * Measuring at a different quality than production serves makes every number here a fiction.
 */
const SERVED_BROTLI_QUALITY = 5;

/**
 * Also from `compressOnce`: `Bun.gzipSync(bytes, { level: 6 })`.
 *
 * gzip is what most origins and every proxy in front of one actually negotiate, and it is the
 * encoding the PERFORMANCE ceiling is stated in — so it is measured here rather than inferred
 * from brotli. Brotli is ~7% denser on this bundle, which is enough for a brotli-only gate to
 * report a passing critical path that is 25 KB over its gzip ceiling on the wire.
 */
const SERVED_GZIP_LEVEL = 6;

/**
 * Match both an element symbol and a hook export to exclude JSX-only helper chunks.
 * The renderer has a separate production-error signature. Check every match: a JSX
 * helper sorting first must not conceal a late core runtime or renderer.
 */
const REACT_RUNTIME_MARKERS = ['react.transitional.element', 'useState'];

export interface CriticalAsset {
	/** Bytes actually sent: the precompressed sibling when nginx has one, else raw. */
	brotliBytes: number;
	/** Bytes sent to a client that negotiated gzip, which most of them do. */
	gzipBytes: number;
	name: string;
	rawBytes: number;
}

/**
 * Assets the browser must fetch before it can render: the entry module, everything
 * index.html asks it to modulepreload, and the render-blocking stylesheets.
 * Deliberately excludes prefetch/lazy chunks — those are off the critical path.
 */
export function parseCriticalAssets(html: string): string[] {
	const names = new Set<string>();

	// Match whole tags, then inspect their attributes, rather than assuming an
	// attribute order. A regex like /rel="modulepreload"[^>]+href=/ silently misses
	// any tag that emits href first, and a gate that under-counts is worse than none.
	// Matched case-insensitively for the same reason: tag and attribute names are
	// case-insensitive in HTML, so a transform emitting <SCRIPT> or TYPE="module"
	// would zero out this scan and report a passing gate having counted nothing.
	for (const tag of html.matchAll(/<(script|link)\b([^>]*)>/gi)) {
		const [, tagName = '', attrs = ''] = tag;
		const href = /\b(?:src|href)="\/assets\/([^"]+)"/i.exec(attrs)?.[1];
		if (!href) continue;

		if (tagName.toLowerCase() === 'script') {
			if (/\btype="module"/i.test(attrs)) names.add(href);
			continue;
		}
		// Only render-blocking link types belong on the critical path. `prefetch`,
		// `preload as=...`, and `modulepreload` for lazy routes are deliberately excluded.
		if (/\brel="(?:modulepreload|stylesheet)"/i.test(attrs)) names.add(href);
	}
	return [...names];
}

export function sizeOf(assetName: string, distDir: string = DEFAULT_DIST_DIR): CriticalAsset {
	const raw = join(distDir, 'assets', assetName);
	const br = `${raw}.br`;
	const gz = `${raw}.gz`;
	const rawBytes = statSync(raw).size;
	// This build emits no precompressed siblings, so brotli is computed here. Falling back to RAW
	// bytes (as the spernakit original does, where the build does emit .br) would silently turn
	// this into a ~3.5x looser raw-size budget while still printing "br".
	//
	// The quality must match what THIS app actually serves, not what a static precompression step
	// would produce. backend/src/staticAssets.ts compresses on demand at BROTLI_PARAM_QUALITY 5
	// and memoises the result, so quality 11 understated real delivered bytes by ~15 KB — enough
	// to pass an artifact that was over its own stated budget.
	const bytes = readFileSync(raw);
	const brotliBytes = existsSync(br)
		? statSync(br).size
		: brotliCompressSync(bytes, {
				params: { [constants.BROTLI_PARAM_QUALITY]: SERVED_BROTLI_QUALITY },
			}).length;
	const gzipBytes = existsSync(gz)
		? statSync(gz).size
		: gzipSync(bytes, { level: SERVED_GZIP_LEVEL }).length;
	return { brotliBytes, gzipBytes, name: assetName, rawBytes };
}

/**
 * The entry module, located with the same order-independent scan parseCriticalAssets uses. The
 * previous `/<script[^>]+type="module"[^>]+src=/` regex assumed `type` precedes `src`; any bundler
 * or HTML transform emitting them the other way round produced no match, and the caller turned
 * that into a silently skipped waterfall assertion — a gate reporting success having checked
 * nothing. Returns null so the caller must decide explicitly.
 */
export function findEntryChunk(html: string): null | string {
	for (const tag of html.matchAll(/<script\b([^>]*)>/gi)) {
		const attrs = tag[1] ?? '';
		if (!/\btype="module"/i.test(attrs)) continue;
		const src = /\bsrc="\/assets\/([^"]+)"/i.exec(attrs)?.[1];
		if (src) return src;
	}
	return null;
}

/** Chunks the entry imports statically, i.e. needed before anything can execute. */
export function staticImportsOf(entryName: string, distDir: string = DEFAULT_DIST_DIR): string[] {
	const source = readFileSync(join(distDir, 'assets', entryName), 'utf-8');
	const imports = new Set<string>();
	// Binding imports (`...from"./c.js"`) AND side-effect imports (`import"./c.js"`). Matching
	// only the first under-reports the waterfall: a side-effect import is just as serialized, and
	// a chunk pulled in purely for its side effects is exactly the kind a refactor introduces
	// without anyone noticing. `import("./c.js")` is deliberately not matched — dynamic imports
	// are lazy by definition and belong off the critical path.
	for (const m of source.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) {
		if (m[1]) imports.add(m[1]);
	}
	return [...imports];
}

export function findReactRuntimeChunks(distDir: string = DEFAULT_DIST_DIR): {
	react: string[];
	renderer: string[];
} {
	const assetsDir = join(distDir, 'assets');
	const react: string[] = [];
	const renderer: string[] = [];
	// Only .js chunks can hold the runtime; skip .br/.gz/.map siblings and CSS.
	for (const name of readdirSync(assetsDir).filter((f) => f.endsWith('.js'))) {
		const content = readFileSync(join(assetsDir, name), 'utf-8');
		if (REACT_RUNTIME_MARKERS.every((marker) => content.includes(marker))) react.push(name);
		if (content.includes('Minified React error')) renderer.push(name);
	}
	return { react, renderer };
}
