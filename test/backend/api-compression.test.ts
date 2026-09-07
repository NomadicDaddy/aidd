import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';

import { securityHeadersPlugin } from '../../backend/src/plugins/securityHeaders.ts';

describe('API response compression', () => {
	test('serves large JSON objects compressed when the client accepts gzip', async () => {
		const app = new Elysia().use(securityHeadersPlugin).get('/api/v1/large', () => ({
			rows: Array.from({ length: 500 }, () => 'repeatable'),
		}));
		const response = await app.handle(
			new Request('http://localhost/api/v1/large', {
				headers: { 'accept-encoding': 'gzip' },
			}),
		);

		expect(response.headers.get('content-encoding')).toBe('gzip');
		expect(response.headers.get('vary')).toBe('Accept-Encoding');
		const compressed = new Uint8Array(await response.arrayBuffer());
		const parsed = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(compressed))) as {
			rows: string[];
		};
		expect(parsed.rows).toHaveLength(500);
	});

	test('leaves small JSON objects uncompressed', async () => {
		const app = new Elysia()
			.use(securityHeadersPlugin)
			.get('/api/v1/small', () => ({ ok: true }));
		const response = await app.handle(
			new Request('http://localhost/api/v1/small', {
				headers: { 'accept-encoding': 'gzip' },
			}),
		);

		expect(response.headers.get('content-encoding')).toBeNull();
		expect(await response.json()).toEqual({ ok: true });
	});
});
