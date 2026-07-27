/**
 * Content typing, cache policy, and response compression for the prebuilt frontend.
 *
 * The web binary serves `frontend/dist` itself — there is no nginx or other proxy in the
 * default loopback path or in the Docker image (see Dockerfile), so anything a reverse proxy
 * would normally add has to happen here. Policy mirrors the template's nginx config
 * (spernakit `docker/nginx.conf`) so behaviour is consistent across the fleet:
 * `/assets/` immutable for a year, gzip level 6 / brotli level 5, `Vary: Accept-Encoding`.
 */
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';

const IMMUTABLE_MAX_AGE = 31_536_000;
/** Root-level assets (favicon, og-image, manifest) carry no content hash, so they must revalidate. */
const UNHASHED_MAX_AGE = 3_600;

const CONTENT_TYPES = new Map<string, string>([
	['.css', 'text/css; charset=utf-8'],
	['.html', 'text/html; charset=utf-8'],
	['.ico', 'image/x-icon'],
	['.jpeg', 'image/jpeg'],
	['.jpg', 'image/jpeg'],
	['.js', 'text/javascript; charset=utf-8'],
	['.json', 'application/json; charset=utf-8'],
	['.png', 'image/png'],
	['.svg', 'image/svg+xml'],
	['.webmanifest', 'application/manifest+json'],
	['.woff2', 'font/woff2'],
]);

/**
 * Compressible content types, matching the template's `gzip_types`/`brotli_types`. Fonts and
 * raster images are already compressed: re-compressing burns CPU and usually grows them.
 */
const COMPRESSIBLE = /^(?:text\/|application\/(?:json|manifest\+json|xml)|image\/svg\+xml)/;
/** Below roughly one MTU the header overhead outweighs any saving. */
const MIN_COMPRESS_BYTES = 1024;

export type Encoding = 'br' | 'gzip' | 'zstd';

/** Weak validator for a file whose served representation may vary by content encoding. */
export function fileEtag(mtimeMs: number, size: number): string {
	return `W/"${mtimeMs}-${size}"`;
}

/**
 * `If-None-Match` uses weak comparison for GET requests. Accept a matching tag from a list and
 * the wildcard form, while treating strong and weak forms of the same opaque tag as equivalent.
 */
export function ifNoneMatchMatches(ifNoneMatch: null | string, etag: string): boolean {
	if (!ifNoneMatch) return false;
	const opaqueTag = etag.replace(/^W\//, '');
	return ifNoneMatch.split(',').some((candidate) => {
		const trimmed = candidate.trim();
		return trimmed === '*' || trimmed.replace(/^W\//, '') === opaqueTag;
	});
}

export function contentTypeFor(path: string): string {
	const dot = path.lastIndexOf('.');
	if (dot === -1) return 'application/octet-stream';
	return CONTENT_TYPES.get(path.slice(dot).toLowerCase()) ?? 'application/octet-stream';
}

/**
 * Cache policy by URL path. Vite content-hashes everything under `/assets/`, so those may be
 * cached indefinitely; the entry HTML must not be, or a client would keep resolving stale
 * chunk hashes after an upgrade. HTML returns null so the caller leaves `Cache-Control` unset
 * and the security-headers plugin applies its `no-store` default.
 */
export function cacheControlFor(urlPath: string, contentType: string): null | string {
	if (contentType.startsWith('text/html')) return null;
	if (urlPath.startsWith('/assets/')) return `public, max-age=${IMMUTABLE_MAX_AGE}, immutable`;
	return `public, max-age=${UNHASHED_MAX_AGE}`;
}

/**
 * Pick the best encoding the client accepts. Preference order is zstd, brotli, gzip — densest
 * first. Entries explicitly refused with `q=0` are skipped; a bare `*` is not treated as
 * consent for a specific encoding, since we would rather send identity than guess wrong.
 */
export function negotiateEncoding(acceptEncoding: null | string): Encoding | null {
	if (!acceptEncoding) return null;
	const accepted = new Set<string>();
	for (const part of acceptEncoding.split(',')) {
		const [rawName, ...params] = part.trim().split(';');
		const name = rawName?.trim().toLowerCase();
		if (!name) continue;
		const refused = params.some((p) => p.trim().replace(/\s/g, '').toLowerCase() === 'q=0');
		if (!refused) accepted.add(name);
	}
	for (const candidate of ['zstd', 'br', 'gzip'] as const) {
		if (accepted.has(candidate)) return candidate;
	}
	return null;
}

export function isCompressible(contentType: string, byteLength: number): boolean {
	return byteLength >= MIN_COMPRESS_BYTES && COMPRESSIBLE.test(contentType);
}

/** Compress without memoising. Use for bodies that are generated per request, not read from disk. */
export function compressOnce(
	encoding: Encoding,
	bytes: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
	if (encoding === 'gzip') return Bun.gzipSync(bytes, { level: 6 });
	if (encoding === 'zstd') return new Uint8Array(Bun.zstdCompressSync(bytes, { level: 3 }));
	return new Uint8Array(
		brotliCompressSync(bytes, {
			params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
		}),
	);
}

/**
 * Compressed payloads keyed by file identity and encoding. dist is static for the lifetime of
 * the process, so each chunk is compressed at most once per encoding; the mtime/size in the key
 * means a rebuilt dist is recompressed rather than served stale. Bounded so a pathological dist
 * cannot grow this without limit.
 */
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const cache = new Map<string, Uint8Array<ArrayBuffer>>();
let cachedBytes = 0;

/**
 * Compress `bytes`, reusing a previous result when possible. Returns null when compression did
 * not actually shrink the payload, in which case the caller should send it unencoded.
 */
export function compressed(
	encoding: Encoding,
	bytes: Uint8Array<ArrayBuffer>,
	identity: string,
): null | Uint8Array<ArrayBuffer> {
	const key = `${encoding}:${identity}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const out = compressOnce(encoding, bytes);
	if (out.length >= bytes.length) return null;
	if (cachedBytes + out.length <= MAX_CACHE_BYTES) {
		cache.set(key, out);
		cachedBytes += out.length;
	}
	return out;
}

/** Test seam: drop memoised payloads so a suite can assert compression behaviour in isolation. */
export function resetCompressionCache(): void {
	cache.clear();
	cachedBytes = 0;
}
