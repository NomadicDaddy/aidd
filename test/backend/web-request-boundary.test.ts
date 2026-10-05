import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';
import { createTestServer } from './_helpers/web-test-server.ts';

// The assembled server in its default configuration: loopback-bound, no token. Both cases below
// are a page in the operator's own browser reaching 127.0.0.1, so they must hold on exactly this
// panel, not only on one with web.allowRemote set.
describe('web request boundary (default loopback panel)', () => {
	let workspace = '';
	let server: Awaited<ReturnType<typeof createTestServer>>;

	beforeAll(async () => {
		workspace = await testTempDir('aidd-web-boundary-');
		const rootDir = join(workspace, 'aidd-root');
		await mkdir(join(rootDir, 'frontend', 'dist'), { recursive: true });
		await writeFile(join(rootDir, 'frontend', 'dist', 'index.html'), '<div id="root"></div>');
		server = await createTestServer(rootDir, workspace);
	});

	afterAll(async () => {
		server.runService.markDisposed();
		await server.database.close();
		await removeTempTree(workspace);
	});

	test('answers its own loopback names', async () => {
		for (const base of [
			'http://127.0.0.1:3210',
			'http://localhost:3210',
			'http://[::1]:3210',
		]) {
			const response = await server.app.handle(new Request(`${base}/api/v1/health`));
			expect(response.status).toBe(200);
		}
	});

	test('refuses a DNS-rebound hostname even though the peer is local', async () => {
		// A rebinding page is same-origin with itself, so it sends no foreign Origin; only the
		// Host names the attacker's domain.
		const response = await server.app.handle(
			new Request('http://attacker.example:3210/api/v1/health'),
		);
		expect(response.status).toBe(401);
	});

	test('refuses a cross-origin request from another site', async () => {
		const response = await server.app.handle(
			new Request('http://127.0.0.1:3210/api/v1/health', {
				headers: { origin: 'http://attacker.example' },
			}),
		);
		expect(response.status).toBe(403);
	});

	test('accepts its own origin and requests without one', async () => {
		const sameOrigin = await server.app.handle(
			new Request('http://127.0.0.1:3210/api/v1/health', {
				headers: { origin: 'http://127.0.0.1:3210' },
			}),
		);
		expect(sameOrigin.status).toBe(200);
		const noOrigin = await server.app.handle(
			new Request('http://127.0.0.1:3210/api/v1/health'),
		);
		expect(noOrigin.status).toBe(200);
	});
});
