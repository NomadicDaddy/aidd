import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';

import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import type { WebContext } from '../../backend/src/context.ts';

import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createSettingsRoutes } from '../../backend/src/routes/settings.ts';
import { SettingsService } from '../../backend/src/services/settingsService.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

function webConfig(workspace: string): ResolvedWebConfig {
	return {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [workspace],
		autoChainLimit: 3,
		autoChainRuns: false,
		dataDir: join(workspace, 'data'),
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		port: 3210,
		showSpernakitProject: false,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: false,
		useWorktrees: false,
	};
}

function runtimeConfig(web: ResolvedWebConfig): { web: ResolvedWebConfig } & ResolvedConfig {
	return {
		cli: 'native',
		dirtyTreeThreshold: 50,
		idleNudgeTimeoutSeconds: 600,
		idleTimeoutSeconds: 900,
		maxConsecutiveTimeoutRetries: 2,
		maxIterations: null,
		noClean: false,
		noWorkBackoffMs: 30_000,
		preflightDoctor: false,
		quitOnAbort: 0,
		rateLimitBackoffSeconds: 300,
		rateLimitBufferSeconds: 60,
		reasoningEffort: 'low',
		timeoutSeconds: 3600,
		web,
	};
}

function settingsApp(workspace: string, configPath: string) {
	const config = runtimeConfig(webConfig(workspace));
	const context = {
		config,
		directAiService: { updateConfig() {} },
		directorService: { updateConfig() {} },
		projectService: { updateConfig() {} },
		runService: { updateConfig() {} },
		settingsService: new SettingsService(config, configPath),
	} as unknown as WebContext;
	return new Elysia().use(errorHandlerPlugin).use(createSettingsRoutes(context));
}

function request(path: string, method: 'POST' | 'PUT', applicationRoots: string[]): Request {
	return new Request(`http://localhost/api/v1/settings/${path}`, {
		body: JSON.stringify({
			applicationRoots,
			...(method === 'PUT'
				? { cli: 'native', ignoredFolders: ['node_modules'], reasoningEffort: 'low' }
				: {}),
		}),
		headers: { 'content-type': 'application/json' },
		method,
	});
}

async function errorMessage(response: Response): Promise<string> {
	return ((await response.json()) as { error: string }).error;
}

describe('settings application-root validation', () => {
	test('names blank, whitespace, relative, missing, and non-directory roots', async () => {
		const workspace = await testTempDir('aidd-settings-roots-invalid-');
		const configPath = join(workspace, 'config.json');
		const filePath = join(workspace, 'not-a-directory.txt');
		await Bun.write(filePath, 'file');
		const app = settingsApp(workspace, configPath);
		const cases = [
			{ expected: 'root #1 is empty or whitespace-only', root: '' },
			{ expected: 'root #1 is empty or whitespace-only', root: '   ' },
			{ expected: 'root "relative/apps" is relative', root: 'relative/apps' },
			{
				expected: `root "${join(workspace, 'missing')}" does not exist`,
				root: join(workspace, 'missing'),
			},
			{ expected: `root "${filePath}" is not a directory`, root: filePath },
		];

		for (const entry of cases) {
			const response = await app.handle(
				request('application-roots/validate', 'POST', [entry.root]),
			);
			expect(response.status).toBe(400);
			expect((await errorMessage(response)).toLowerCase()).toContain(
				entry.expected.toLowerCase(),
			);
		}

		await removeTempTree(workspace);
	});

	test('the final save rejects a missing root and persists a valid existing root', async () => {
		const workspace = await testTempDir('aidd-settings-roots-save-');
		const configPath = join(workspace, 'config.json');
		const validRoot = join(workspace, 'apps');
		const missingRoot = join(workspace, 'missing');
		await mkdir(validRoot);
		const app = settingsApp(workspace, configPath);

		const missing = await app.handle(request('config', 'PUT', [missingRoot]));
		expect(missing.status).toBe(400);
		expect(await errorMessage(missing)).toContain(
			`Application root "${missingRoot}" does not exist`,
		);

		const validation = await app.handle(
			request('application-roots/validate', 'POST', [validRoot]),
		);
		expect(validation.status).toBe(200);
		const saved = await app.handle(request('config', 'PUT', [validRoot]));
		expect(saved.status).toBe(200);
		const written = JSON.parse(await readFile(configPath, 'utf8')) as {
			web?: { allowedRoots?: string[] };
		};
		expect(written.web?.allowedRoots).toEqual([validRoot]);

		await removeTempTree(workspace);
	});
});
