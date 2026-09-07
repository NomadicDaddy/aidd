import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
	cacheControlFor,
	compressed,
	compressOnce,
	contentTypeFor,
	fileEtag,
	ifNoneMatchMatches,
	isCompressible,
	negotiateEncoding,
	resetCompressionCache,
	serveStaticFile,
} from '../../backend/src/staticAssets.ts';

import { testTempDir } from '../_helpers/temp.ts';

const textBody = () => new TextEncoder().encode('export const x = 1;\n'.repeat(200));

describe('contentTypeFor', () => {
	test('types every extension frontend/dist actually ships', () => {
		expect(contentTypeFor('/assets/app.js')).toBe('text/javascript; charset=utf-8');
		expect(contentTypeFor('/assets/app.css')).toBe('text/css; charset=utf-8');
		expect(contentTypeFor('/index.html')).toBe('text/html; charset=utf-8');
		expect(contentTypeFor('/assets/font.woff2')).toBe('font/woff2');
		expect(contentTypeFor('/og-image.jpg')).toBe('image/jpeg');
		expect(contentTypeFor('/favicon.ico')).toBe('image/x-icon');
		expect(contentTypeFor('/icon.png')).toBe('image/png');
		expect(contentTypeFor('/favicon.svg')).toBe('image/svg+xml');
		expect(contentTypeFor('/site.webmanifest')).toBe('application/manifest+json');
	});

	test('falls back to octet-stream for unknown and extensionless paths', () => {
		expect(contentTypeFor('/assets/thing.bin')).toBe('application/octet-stream');
		expect(contentTypeFor('/no-extension')).toBe('application/octet-stream');
	});
});

describe('cacheControlFor', () => {
	test('content-hashed assets are immutable for a year', () => {
		expect(cacheControlFor('/assets/index-A1b2C3.js', 'text/javascript; charset=utf-8')).toBe(
			'public, max-age=31536000, immutable',
		);
	});

	test('unhashed root assets revalidate', () => {
		expect(cacheControlFor('/og-image.jpg', 'image/jpeg')).toBe('public, max-age=3600');
	});

	// A cached entry document would keep pointing at chunk hashes that no longer exist after an
	// upgrade. Returning null leaves the security-headers plugin's no-store default in place.
	test('html opts out so the no-store default applies', () => {
		expect(cacheControlFor('/index.html', 'text/html; charset=utf-8')).toBeNull();
		expect(cacheControlFor('/', 'text/html; charset=utf-8')).toBeNull();
	});
});

describe('file validators', () => {
	test('derives a weak ETag from modification time and size', () => {
		expect(fileEtag(1_234.5, 678)).toBe('W/"1234.5-678"');
	});

	test('matches weak or strong tags in an If-None-Match list', () => {
		const etag = fileEtag(1_234.5, 678);
		expect(ifNoneMatchMatches(`"other", ${etag}`, etag)).toBe(true);
		expect(ifNoneMatchMatches('"1234.5-678"', etag)).toBe(true);
		expect(ifNoneMatchMatches('*', etag)).toBe(true);
		expect(ifNoneMatchMatches('"other"', etag)).toBe(false);
		expect(ifNoneMatchMatches(null, etag)).toBe(false);
	});
});

describe('negotiateEncoding', () => {
	test('prefers budgeted brotli compression when client quality is equal', () => {
		expect(negotiateEncoding('gzip, br, zstd')).toBe('br');
		expect(negotiateEncoding('gzip, br')).toBe('br');
		expect(negotiateEncoding('gzip')).toBe('gzip');
	});

	test('returns null when nothing is acceptable', () => {
		expect(negotiateEncoding(null)).toBeNull();
		expect(negotiateEncoding('')).toBeNull();
		expect(negotiateEncoding('identity')).toBeNull();
		expect(negotiateEncoding('deflate')).toBeNull();
	});

	test('honours an explicit q=0 refusal', () => {
		expect(negotiateEncoding('gzip;q=0')).toBeNull();
		expect(negotiateEncoding('br;q=0, gzip')).toBe('gzip');
		expect(negotiateEncoding('gzip;q=0.5')).toBe('gzip');
		expect(negotiateEncoding('br;q=0.0, zstd')).toBe('zstd');
		expect(negotiateEncoding('br;q=0.5, gzip;q=0.9')).toBe('gzip');
	});

	test('does not read a bare wildcard as consent for a specific encoding', () => {
		expect(negotiateEncoding('*')).toBeNull();
	});

	test('tolerates whitespace and case', () => {
		expect(negotiateEncoding('  GZIP ,  BR  ')).toBe('br');
	});
});

describe('isCompressible', () => {
	test('accepts text and structured payloads above the floor', () => {
		expect(isCompressible('text/javascript; charset=utf-8', 5000)).toBe(true);
		expect(isCompressible('image/svg+xml', 5000)).toBe(true);
		expect(isCompressible('application/manifest+json', 5000)).toBe(true);
	});

	// Re-compressing these burns CPU and typically grows the payload.
	test('rejects already-compressed formats', () => {
		expect(isCompressible('font/woff2', 50_000)).toBe(false);
		expect(isCompressible('image/jpeg', 50_000)).toBe(false);
		expect(isCompressible('image/png', 50_000)).toBe(false);
	});

	test('rejects bodies below the size floor', () => {
		expect(isCompressible('text/css; charset=utf-8', 512)).toBe(false);
	});
});

describe('compression', () => {
	test('every encoding actually shrinks a text payload', () => {
		const bytes = textBody();
		for (const encoding of ['br', 'gzip', 'zstd'] as const) {
			expect(compressOnce(encoding, bytes).byteLength).toBeLessThan(bytes.byteLength);
		}
	});

	test('memoises by identity and re-compresses when the file changes', () => {
		resetCompressionCache();
		const bytes = textBody();
		const first = compressed('br', bytes, 'chunk.js:1:100');
		const second = compressed('br', bytes, 'chunk.js:1:100');
		expect(first).not.toBeNull();
		// Same identity returns the very same buffer rather than compressing twice.
		expect(second).toBe(first);

		// A rebuilt file changes mtime/size, so the payload must not be served from the old entry.
		const rebuilt = compressed(
			'br',
			new TextEncoder().encode('different'.repeat(300)),
			'chunk.js:2:99',
		);
		expect(rebuilt).not.toBe(first);
	});

	test('reports null when compression would not shrink the payload', () => {
		resetCompressionCache();
		// High-entropy bytes are incompressible; gzip framing makes the result larger.
		const noisy = crypto.getRandomValues(new Uint8Array(2048));
		expect(compressed('gzip', noisy, 'noise:1:2048')).toBeNull();
	});
});

// Everything above tests the compressor. None of it tests the header. spernakit enforces
// "text compression is actually served" with `verify-compression`, a runtime probe against a
// running server behind nginx; aidd has no proxy tier and precompresses nothing at build time,
// so that gate does not port -- its dev mode cannot fail and its build half would fail by
// design. The rule still applies, and this is where it is enforced instead: the two places the
// negotiated encoding becomes a response header, reached directly rather than through a server.
describe('serveStaticFile actually sets Content-Encoding', () => {
	/** A dist tree covering each branch: compressible asset, incompressible type, sub-floor body. */
	async function distFixture(): Promise<string> {
		const dist = await testTempDir('aidd-static-serve-');
		await mkdir(join(dist, 'assets'), { recursive: true });
		await writeFile(join(dist, 'assets', 'app.js'), 'export const x = 1;\n'.repeat(200));
		await writeFile(join(dist, 'assets', 'logo.png'), Buffer.alloc(4096, 7));
		await writeFile(join(dist, 'assets', 'tiny.css'), 'a{color:red}');
		// Root-level, so it revalidates rather than being immutable, and carries an ETag.
		await writeFile(
			join(dist, 'sw.js'),
			'self.addEventListener("fetch", () => {});\n'.repeat(60),
		);
		await writeFile(
			join(dist, 'index.html'),
			`<html><head></head><body>${'x'.repeat(2000)}</body></html>`,
		);
		return dist;
	}

	const serve = (dist: string, path: string, accept: null | string) =>
		serveStaticFile(dist, path, false, accept, null);

	test('a served asset carries the encoding the client asked for, and a shorter body', async () => {
		resetCompressionCache();
		const dist = await distFixture();
		const identity = await serve(dist, '/assets/app.js', null);
		const identityBytes = (await identity.arrayBuffer()).byteLength;

		for (const encoding of ['br', 'gzip', 'zstd'] as const) {
			resetCompressionCache();
			const response = await serve(dist, '/assets/app.js', encoding);
			expect(response.headers.get('Content-Encoding')).toBe(encoding);
			expect(response.headers.get('Vary')).toBe('Accept-Encoding');
			// The header is only true if the body is the encoded one. Asserting the header alone
			// would pass against a response that labelled identity bytes as compressed.
			expect((await response.arrayBuffer()).byteLength).toBeLessThan(identityBytes);
		}
	});

	test('the generated index.html body is encoded too, not just files read from disk', async () => {
		resetCompressionCache();
		const dist = await distFixture();
		// index.html takes a separate branch: the trace marker is injected per request, so the
		// body is compressed unmemoised rather than served from the identity cache.
		const response = await serve(dist, '/', 'gzip');
		expect(response.headers.get('Content-Encoding')).toBe('gzip');
		expect(response.headers.get('Vary')).toBe('Accept-Encoding');
		const decoded = Bun.gunzipSync(new Uint8Array(await response.arrayBuffer()));
		expect(new TextDecoder().decode(decoded)).toContain('aidd-trace-default');
	});

	test('a client that accepts nothing gets identity bytes but still gets Vary', async () => {
		resetCompressionCache();
		const dist = await distFixture();
		const response = await serve(dist, '/assets/app.js', null);
		expect(response.headers.get('Content-Encoding')).toBeNull();
		// Without Vary a shared cache could hand these identity bytes to the next client as if
		// they were the compressed representation, or the reverse.
		expect(response.headers.get('Vary')).toBe('Accept-Encoding');
	});

	test('an already-compressed type is served untouched, with no Vary to negotiate over', async () => {
		resetCompressionCache();
		const dist = await distFixture();
		const response = await serve(dist, '/assets/logo.png', 'br');
		expect(response.headers.get('Content-Encoding')).toBeNull();
		expect(response.headers.get('Vary')).toBeNull();
	});

	test('a body below the size floor is served unencoded', async () => {
		resetCompressionCache();
		const dist = await distFixture();
		const response = await serve(dist, '/assets/tiny.css', 'br');
		expect(response.headers.get('Content-Encoding')).toBeNull();
	});

	test('a 304 carries no encoding for a body it is not sending', async () => {
		resetCompressionCache();
		const dist = await distFixture();
		const first = await serve(dist, '/sw.js', 'br');
		expect(first.headers.get('Content-Encoding')).toBe('br');
		const etag = first.headers.get('ETag');
		expect(etag).not.toBeNull();
		const revalidated = await serveStaticFile(dist, '/sw.js', false, 'br', etag);
		expect(revalidated.status).toBe(304);
		expect(revalidated.headers.get('Content-Encoding')).toBeNull();
		// Vary survives the 304 so the cache entry the client already holds stays keyed correctly.
		expect(revalidated.headers.get('Vary')).toBe('Accept-Encoding');
	});
});
