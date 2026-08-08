/**
 * Content typing, cache policy, response compression, and file serving for the prebuilt frontend.
 *
 * The web binary serves `frontend/dist` itself — there is no nginx or other proxy in the
 * default loopback path or in the Docker image (see Dockerfile), so anything a reverse proxy
 * would normally add has to happen here. Policy mirrors the template's nginx config
 * (spernakit `docker/nginx.conf`) so behaviour is consistent across the fleet:
 * `/assets/` immutable for a year, gzip level 6 / brotli level 5, `Vary: Accept-Encoding`.
 *
 * `serveStaticFile` lives here rather than in `server.ts` because it is the only place the
 * policy above becomes an actual response header, and `server.ts` cannot be reached from a test
 * without standing up the whole service graph. Keeping the decision beside the helpers it
 * composes is what lets `test/backend/static-assets.test.ts` assert that a **served** response
 * carries `Content-Encoding`, rather than only that the compressor compresses.
 */
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';

import { pathIsInside } from './paths.ts';

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

type StaticFileOptions = {
	fallbackToIndex?: boolean;
};

/**
 * Apply the negotiated content encoding, falling back to the unencoded body when the client
 * accepts nothing we speak, the payload is too small or already compressed, or compression
 * failed to shrink it. `Vary` is set whenever the body was eligible, so a shared cache never
 * serves an encoded payload to a client that cannot read it.
 */
function encodedResponse(
	bytes: Uint8Array<ArrayBuffer>,
	contentType: string,
	cacheControl: null | string,
	acceptEncoding: null | string,
	identity: string,
	etag: null | string,
): Response {
	const headers = new Headers({ 'content-type': contentType });
	if (cacheControl) headers.set('Cache-Control', cacheControl);
	if (etag) headers.set('ETag', etag);
	if (!isCompressible(contentType, bytes.byteLength)) {
		return new Response(bytes, { headers });
	}
	headers.set('Vary', 'Accept-Encoding');
	const encoding = negotiateEncoding(acceptEncoding);
	const payload = encoding ? compressed(encoding, bytes, identity) : null;
	if (!encoding || !payload) {
		return new Response(bytes, { headers });
	}
	headers.set('Content-Encoding', encoding);
	return new Response(payload, { headers });
}

export async function serveStaticFile(
	distDir: string,
	path: string,
	traceDefault: boolean,
	acceptEncoding: null | string,
	ifNoneMatch: null | string,
	options: StaticFileOptions = {},
): Promise<Response> {
	const relativePath = path.replace(/^\/+/, '') || 'index.html';
	const candidate = resolve(distDir, relativePath);
	const candidateExists = pathIsInside(distDir, candidate) && existsSync(candidate);
	if (!candidateExists && options.fallbackToIndex !== true) {
		return new Response('Not found', {
			headers: { 'content-type': 'text/plain; charset=utf-8' },
			status: 404,
		});
	}
	const target = candidateExists ? candidate : join(distDir, 'index.html');
	const contentType = contentTypeFor(target);
	// Policy follows the served URL, not the resolved file: an unknown path that falls back to
	// index.html must not inherit the caching of the path that was requested.
	const servedPath = candidateExists ? path : '/index.html';
	const cacheControl = cacheControlFor(servedPath, contentType);
	const file = Bun.file(target);
	if (contentType.startsWith('text/html')) {
		const html = await file.text();
		const bootstrap = `<meta name="aidd-trace-default" content="${traceDefault ? 'true' : 'false'}" />`;
		const injected = html.includes('</head>')
			? html.replace('</head>', `\t\t${bootstrap}\n\t</head>`)
			: `${bootstrap}${html}`;
		// The injected marker varies with config, so this body is not the file on disk and is
		// deliberately not memoised.
		const bytes = new TextEncoder().encode(injected);
		const headers = new Headers({ 'content-type': contentType, Vary: 'Accept-Encoding' });
		const encoding = negotiateEncoding(acceptEncoding);
		if (!encoding || !isCompressible(contentType, bytes.byteLength)) {
			return new Response(bytes, { headers });
		}
		headers.set('Content-Encoding', encoding);
		return new Response(compressOnce(encoding, bytes), { headers });
	}
	const stats = statSync(target);
	const identity = `${target}:${stats.mtimeMs}:${stats.size}`;
	const etag = servedPath.startsWith('/assets/') ? null : fileEtag(stats.mtimeMs, stats.size);
	if (etag && ifNoneMatchMatches(ifNoneMatch, etag)) {
		const headers = new Headers({ ETag: etag });
		if (cacheControl) headers.set('Cache-Control', cacheControl);
		if (isCompressible(contentType, stats.size)) headers.set('Vary', 'Accept-Encoding');
		return new Response(null, { headers, status: 304 });
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	return encodedResponse(bytes, contentType, cacheControl, acceptEncoding, identity, etag);
}
