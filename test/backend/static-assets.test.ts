import { describe, expect, test } from 'bun:test';

import {
	cacheControlFor,
	compressOnce,
	compressed,
	contentTypeFor,
	isCompressible,
	negotiateEncoding,
	resetCompressionCache,
} from '../../backend/src/staticAssets.ts';

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
			'public, max-age=31536000, immutable'
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

describe('negotiateEncoding', () => {
	test('prefers the densest encoding the client accepts', () => {
		expect(negotiateEncoding('gzip, br, zstd')).toBe('zstd');
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
			'chunk.js:2:99'
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
