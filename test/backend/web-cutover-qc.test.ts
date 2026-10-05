import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { assertRootDataDirectory } from '../../backend/src/db/client.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';
import { createTestServer } from './_helpers/web-test-server.ts';

async function readFiles(dir: string): Promise<{ content: string; path: string }[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return await readFiles(path);
			return [{ content: await readFile(path, 'utf8'), path }];
		}),
	);
	return files.flat();
}

describe('web v2 cutover QC', () => {
	test('rejects backend/data as web database storage', () => {
		const rootDir = process.cwd();
		expect(() => assertRootDataDirectory(rootDir, join(rootDir, 'backend', 'data'))).toThrow(
			'web.dataDir must use the repository root data directory',
		);
	});

	test('serves the approved v2 control-panel pages through the SPA fallback', async () => {
		const workspace = await testTempDir('aidd-web-cutover-');
		const rootDir = join(workspace, 'aidd-root');
		await mkdir(join(rootDir, 'frontend', 'dist'), { recursive: true });
		await writeFile(join(rootDir, 'frontend', 'dist', 'index.html'), '<div id="root"></div>');
		const { app, database, runService } = await createTestServer(rootDir, workspace);
		try {
			for (const route of [
				'/',
				'/projects',
				'/runs',
				'/pipeline-sessions',
				'/director',
				'/recipes',
				'/not-a-real-route',
			]) {
				const response = await app.handle(new Request(`http://localhost${route}`));
				const body = await response.text();

				expect(response.status).toBe(200);
				expect(response.headers.get('content-type')).toContain('text/html');
				expect(body).toContain('<div id="root"></div>');
			}

			const apiMiss = await app.handle(
				new Request('http://localhost/api/not-a-real-endpoint'),
			);
			expect(apiMiss.status).toBe(404);
			expect(apiMiss.headers.get('content-type') ?? '').toContain('application/json');
			expect(await apiMiss.json()).toEqual({ error: 'Not found' });
		} finally {
			runService.markDisposed();
			await database.close();
			await removeTempTree(workspace);
		}
	});

	test('returns 404 instead of the SPA shell for missing frontend assets', async () => {
		const workspace = await testTempDir('aidd-web-assets-');
		const rootDir = join(workspace, 'aidd-root');
		const distDir = join(rootDir, 'frontend', 'dist');
		const assetsDir = join(distDir, 'assets');
		const manifestBody = `{"name":"${'a'.repeat(1_200)}"}\n`;
		await mkdir(assetsDir, { recursive: true });
		await writeFile(join(distDir, 'index.html'), '<div id="root"></div>');
		await writeFile(join(assetsDir, 'bundle.js'), 'export const loaded = true;\n');
		await writeFile(join(distDir, 'site.webmanifest'), manifestBody);
		const { app, database, runService } = await createTestServer(rootDir, workspace);
		try {
			const asset = await app.handle(new Request('http://localhost/assets/bundle.js'));
			expect(asset.status).toBe(200);
			expect(asset.headers.get('content-type')).toContain('text/javascript');
			expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
			expect(asset.headers.get('etag')).toBeNull();
			expect(await asset.text()).toBe('export const loaded = true;\n');

			const unhashed = await app.handle(new Request('http://localhost/site.webmanifest'));
			const etag = unhashed.headers.get('etag');
			expect(unhashed.status).toBe(200);
			expect(unhashed.headers.get('cache-control')).toBe('public, max-age=3600');
			expect(etag).toMatch(/^W\/"[^"]+"$/);
			expect(unhashed.headers.get('vary')).toBe('Accept-Encoding');
			expect(await unhashed.text()).toBe(manifestBody);

			const revalidated = await app.handle(
				new Request('http://localhost/site.webmanifest', {
					headers: { 'If-None-Match': `"unrelated", ${etag ?? ''}` },
				}),
			);
			expect(revalidated.status).toBe(304);
			expect(revalidated.headers.get('cache-control')).toBe('public, max-age=3600');
			expect(revalidated.headers.get('etag')).toBe(etag);
			expect(revalidated.headers.get('vary')).toBe('Accept-Encoding');
			expect(await revalidated.text()).toBe('');

			const missing = await app.handle(
				new Request('http://localhost/assets/PipelineSessionReportPage-stale.js'),
			);
			const body = await missing.text();
			expect(missing.status).toBe(404);
			expect(missing.headers.get('content-type')).toContain('text/plain');
			expect(body).toBe('Not found');
			expect(body).not.toContain('<div id="root"></div>');
		} finally {
			runService.markDisposed();
			await database.close();
			await removeTempTree(workspace);
		}
	});

	test('reads the browser trace default from current config for each page response', async () => {
		const workspace = await testTempDir('aidd-web-trace-default-');
		const rootDir = join(workspace, 'aidd-root');
		await mkdir(join(rootDir, 'frontend', 'dist'), { recursive: true });
		await writeFile(
			join(rootDir, 'frontend', 'dist', 'index.html'),
			'<html><head></head><body><div id="root"></div></body></html>',
		);
		const { app, config, database, runService } = await createTestServer(rootDir, workspace);
		try {
			config.web.traceDataMovement = false;
			const disabled = await app.handle(new Request('http://localhost/director'));
			expect(await disabled.text()).toContain(
				'<meta name="aidd-trace-default" content="false" />',
			);

			config.web.traceDataMovement = true;
			const enabled = await app.handle(new Request('http://localhost/director'));
			expect(await enabled.text()).toContain(
				'<meta name="aidd-trace-default" content="true" />',
			);
		} finally {
			runService.markDisposed();
			await database.close();
			await removeTempTree(workspace);
		}
	});

	test('emits baseline security headers for page and error responses', async () => {
		const workspace = await testTempDir('aidd-web-headers-');
		const rootDir = join(workspace, 'aidd-root');
		await mkdir(join(rootDir, 'frontend', 'dist'), { recursive: true });
		await writeFile(join(rootDir, 'frontend', 'dist', 'index.html'), '<div id="root"></div>');
		const { app, database, runService } = await createTestServer(rootDir, workspace);
		try {
			const pageResponse = await app.handle(new Request('http://localhost/'));
			const errorResponse = await app.handle(
				new Request('http://localhost/api/v1/projects/bad'),
			);

			for (const response of [pageResponse, errorResponse]) {
				expect(response.headers.get('x-content-type-options')).toBe('nosniff');
				expect(response.headers.get('x-frame-options')).toBe('DENY');
				expect(response.headers.get('x-xss-protection')).toBe('0');
				expect(response.headers.get('referrer-policy')).toBe('no-referrer');
				expect(response.headers.get('permissions-policy')).toContain('camera=()');
				expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
				expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
				expect(response.headers.get('content-security-policy')).toContain(
					"default-src 'self'",
				);
				expect(response.headers.get('content-security-policy')).toContain(
					"worker-src 'self' blob:",
				);
				expect(response.headers.get('cache-control')).toBe('no-store');
			}
		} finally {
			runService.markDisposed();
			await database.close();
			await removeTempTree(workspace);
		}
	});

	test('omits COOP header on non-HTTPS LAN origins to avoid ignored-header warnings', async () => {
		const workspace = await testTempDir('aidd-web-headers-lan-');
		const rootDir = join(workspace, 'aidd-root');
		await mkdir(join(rootDir, 'frontend', 'dist'), { recursive: true });
		await writeFile(join(rootDir, 'frontend', 'dist', 'index.html'), '<div id="root"></div>');
		const { app, database, runService } = await createTestServer(rootDir, workspace);
		try {
			const lanNameResponse = await app.handle(new Request('http://demo-host/'));
			const lanAddressResponse = await app.handle(new Request('http://192.168.1.33/'));
			const httpsResponse = await app.handle(new Request('https://demo-host/'));

			for (const response of [lanNameResponse, lanAddressResponse]) {
				expect(response.headers.get('cross-origin-opener-policy')).toBeNull();
				expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
				expect(response.headers.get('content-security-policy')).toContain(
					"default-src 'self'",
				);
			}
			expect(httpsResponse.headers.get('cross-origin-opener-policy')).toBe('same-origin');
		} finally {
			runService.markDisposed();
			await database.close();
			await removeTempTree(workspace);
		}
	});

	test('keeps unrelated product surfaces out of the consolidated web layer', async () => {
		const files = await readFiles(resolve('frontend/src'));
		const webFiles = await readFiles(resolve('backend/src'));
		const scannedFiles = [...files, ...webFiles];
		// Term-scoped exemptions: each file may use ONLY the terms listed for it.
		// Any other banned surface term in these files still fails, so the guard is
		// never wholesale-disabled for a file.
		const allowedSurfaceTerms = new Map<string, ReadonlySet<string>>([
			[resolve('frontend/src/api/types/projects-profile.ts'), new Set(['rbac'])],
			[
				resolve('frontend/src/pages/projects/detail/profile/profile-facets.ts'),
				new Set(['auth', 'rbac']),
			],
			[resolve('frontend/src/pages/projects/projects-list-shared.ts'), new Set(['rbac'])],
			[resolve('frontend/src/pages/settings/settingsDirtyTabs.ts'), new Set(['workspace'])],
			[resolve('frontend/src/pages/settings/settingsNavigation.ts'), new Set(['workspace'])],
			[resolve('frontend/src/pages/settings/SettingsPage.tsx'), new Set(['workspace'])],
			[
				resolve('frontend/src/pages/settings/settingsSaveValidation.ts'),
				new Set(['workspace']),
			],
			[
				resolve('frontend/src/pages/settings/SettingsSectionTabs.tsx'),
				new Set(['workspace']),
			],
			[resolve('frontend/src/pages/settings/SettingsStatusPanels.tsx'), new Set(['auth'])],
			[resolve('frontend/src/pages/settings/SettingsToolbar.tsx'), new Set(['workspace'])],
		]);
		const bannedSurfacePattern =
			/\b(auth|RBAC|workspace|notification|analytics|custom dashboard)\b/gi;
		const matches = scannedFiles.flatMap((file) => {
			const allowed = allowedSurfaceTerms.get(file.path);
			return [...file.content.matchAll(bannedSurfacePattern)]
				.map((match) => match[0])
				.filter((term) => !allowed?.has(term.toLowerCase()))
				.map((term) => `${file.path}: ${term}`);
		});

		expect(matches).toEqual([]);
	});
});
