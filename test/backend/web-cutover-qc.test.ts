import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import { assertRootDataDirectory, createWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { createWebServer } from '../../backend/src/server.ts';
import { AppLauncherService } from '../../backend/src/services/appLauncher/launcher.ts';
import { DiaryService } from '../../backend/src/services/diaryService.ts';
import { DirectorService } from '../../backend/src/services/directorService.ts';
import { SkillService } from '../../backend/src/services/skillService.ts';
import { disabledDirectAiRunner } from '../../backend/src/services/directAiService.ts';
import { PipelineService } from '../../backend/src/services/pipelineService.ts';
import { ProjectInitFailureService } from '../../backend/src/services/project/initFailureService.ts';
import { ProjectService } from '../../backend/src/services/projectService.ts';
import { RecipeService } from '../../backend/src/services/recipeService.ts';
import { RunService } from '../../backend/src/services/runService.ts';
import { SettingsService } from '../../backend/src/services/settingsService.ts';
import { MetricsService } from '../../backend/src/services/metricsService.ts';
import { TelemetryService } from '../../backend/src/services/telemetryService.ts';
import { TerminalSessionManager } from '../../backend/src/services/terminal/sessionManager.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';

import { testTempDir } from '../_helpers/temp.ts';
function makeConfig(web: ResolvedWebConfig): { web: ResolvedWebConfig } & ResolvedConfig {
	return {
		cli: 'native',
		dirtyTreeThreshold: 50,
		idleNudgeTimeoutSeconds: 600,
		idleTimeoutSeconds: 900,
		maxConsecutiveTimeoutRetries: 2,
		maxIterations: null,
		noClean: false,
		noWorkBackoffMs: 30_000,
		quitOnAbort: 0,
		rateLimitBackoffSeconds: 300,
		rateLimitBufferSeconds: 60,
		reasoningEffort: 'low',
		timeoutSeconds: 3600,
		preflightDoctor: false,
		web,
	};
}

async function createTestServer(rootDir: string, workspace: string) {
	const web = {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [workspace],
		dataDir: join(workspace, 'data'),
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		autoChainLimit: 3,
		autoChainRuns: false,
		useWorktrees: false,
		port: 3210,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		showSpernakitProject: false,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: true,
	};
	const config = makeConfig(web);
	const database = await createWebDatabase(web);
	if (database.sqlite) migrateWebDatabase(database.sqlite);
	const webSocketHub = new WebSocketHub();
	const projectService = new ProjectService(web);
	const telemetryService = new TelemetryService({ commands: database.commands, db: database.db });
	const metricsService = new MetricsService({
		dataDir: web.dataDir,
		db: database.db,
		getActiveConnections: () => webSocketHub.peerCount,
	});
	const runService = new RunService(
		config,
		database.db,
		database.commands,
		webSocketHub,
		projectService,
		rootDir,
		telemetryService,
	);
	const recipeService = new RecipeService(rootDir);
	const skillService = new SkillService({ rootDir });
	const pipelineService = new PipelineService({
		db: database.db,
		hub: webSocketHub,
		skillService,
		projectService,
		recipeService,
		runService,
		telemetryService,
	});
	const directorService = new DirectorService(
		config,
		database.db,
		database.commands,
		webSocketHub,
		projectService,
		runService,
	);
	const appLauncherService = new AppLauncherService({ db: database.db, projectService });
	const diaryService = new DiaryService({
		commands: database.commands,
		db: database.db,
		projectService,
		rootDir,
	});
	const app = createWebServer({
		appLauncherService,
		config,
		diaryService,
		directorService,
		database,
		directAiService: disabledDirectAiRunner,
		initFailureService: new ProjectInitFailureService(database.db),
		skillService,
		metricsService,
		pipelineService,
		projectService,
		recipeService,
		rootDir,
		runService,
		settingsService: new SettingsService(config, join(workspace, 'user-config.json')),
		telemetryService,
		terminalSessionManager: new TerminalSessionManager({
			listShells: () => [],
			rootDir,
			spawnPty: null,
		}),
		webSocketHub,
	});
	return { app, config, database, runService };
}

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
			await rm(workspace, { force: true, recursive: true });
		}
	});

	test('returns 404 instead of the SPA shell for missing frontend assets', async () => {
		const workspace = await testTempDir('aidd-web-assets-');
		const rootDir = join(workspace, 'aidd-root');
		const distDir = join(rootDir, 'frontend', 'dist');
		const assetsDir = join(distDir, 'assets');
		await mkdir(assetsDir, { recursive: true });
		await writeFile(join(distDir, 'index.html'), '<div id="root"></div>');
		await writeFile(join(assetsDir, 'bundle.js'), 'export const loaded = true;\n');
		const { app, database, runService } = await createTestServer(rootDir, workspace);
		try {
			const asset = await app.handle(new Request('http://localhost/assets/bundle.js'));
			expect(asset.status).toBe(200);
			expect(asset.headers.get('content-type')).toContain('text/javascript');
			expect(await asset.text()).toBe('export const loaded = true;\n');

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
			await rm(workspace, { force: true, recursive: true });
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
			await rm(workspace, { force: true, recursive: true });
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
			await rm(workspace, { recursive: true, force: true });
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
			await rm(workspace, { recursive: true, force: true });
		}
	});

	test('keeps unrelated legacy product surfaces out of the consolidated web layer', async () => {
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
			[resolve('frontend/src/pages/settings/settingsNavigation.ts'), new Set(['workspace'])],
			[
				resolve('frontend/src/pages/settings/SettingsSectionTabs.tsx'),
				new Set(['workspace']),
			],
			[resolve('frontend/src/pages/settings/SettingsToolbar.tsx'), new Set(['workspace'])],
		]);
		const bannedSurfacePattern =
			/\b(auth|RBAC|workspace|notification|analytics|scheduling|custom dashboard)\b/gi;
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
