import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import type { WebContext } from '../../backend/src/context.ts';
import { createSettingsRoutes } from '../../backend/src/routes/settings.ts';
import { SettingsService } from '../../backend/src/services/settingsService.ts';
import { buildSettingsDto } from '../../backend/src/services/settings/dtoShaping.ts';
import type { StatusCommandRunner } from '../../backend/src/services/settings/status.ts';

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

const runtimeWeb: ResolvedWebConfig = {
	allowRemote: false,
	allowedOrigins: [],
	allowedRoots: ['/x'],
	dataDir: '/x/data',
	hostname: '127.0.0.1',
	ignoredFolders: [],
	maxConcurrentRuns: 2,
	maxConcurrentRunsPerProject: 2,
	autoChainLimit: 3,
	autoChainRuns: false,
	port: 3210,
	spernakitFleetManifest: null,
	spernakitInitScript: null,
	spernakitTemplateRef: null,
	showSpernakitProject: false,
	spernakitTemplateRepo: 'NomadicDaddy/spernakit',
	templates: [],
	traceDataMovement: false,
	useWorktrees: false,
};

describe('settings DTO templates', () => {
	test('surfaces registered templates as slim summaries without leaking initCommand', () => {
		const dto = buildSettingsDto(
			{
				web: {
					templates: [
						{
							cwd: 'targetPath',
							description: 'Vite React scaffold',
							initCommand: ['bun', 'create', 'vite', '{targetPath}'],
							name: 'vite-react',
							postCreate: 'ingest',
							requiresDescription: false,
							rootMustBeInitDir: false,
							validationCommand: 'bun install',
						},
					],
				},
			},
			{ configBaseDir: '/x', configPath: '/x/config.json', current: makeConfig(runtimeWeb) },
		);
		const summary = dto.templates.find((template) => template.name === 'vite-react');
		expect(summary).toEqual({
			description: 'Vite React scaffold',
			name: 'vite-react',
			postCreate: 'ingest',
			requiresDescription: false,
			rootMustBeInitDir: false,
		});
		expect(summary && 'initCommand' in summary).toBe(false);
	});
});

describe('web settings config', () => {
	test('updates user config, preserves unrelated provider keys, and writes native backend names', async () => {
		const workspace = await testTempDir('aidd-web-settings-');
		const configPath = join(workspace, 'home', '.aidd', 'config.json');
		const allowedRoot = join(workspace, 'apps');
		await mkdir(join(configPath, '..'), { recursive: true });
		await Bun.write(
			configPath,
			JSON.stringify({
				providers: {
					zhipu: {
						apiKey: 'provider-secret',
						baseUrl: 'https://api.z.ai/api/coding/paas/v4',
						model: 'glm-5.1',
					},
				},
				sharedDirs: ['D:/shared'],
				triumvirate: {
					execCli: 'native',
					overseerCli: 'claude-code',
					secondaryCli: 'codex',
				},
				web: {
					dataDir: join(workspace, 'data', 'settings-test'),
					maxConcurrentRuns: 3,
					maxConcurrentRunsPerProject: 3,
					useWorktrees: false,
					port: 4567,
				},
			}),
		);
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
		const service = new SettingsService(makeConfig(web), configPath);

		const result = await service.updateConfig({
			applicationRoots: [allowedRoot],
			auditModel: 'audit-model',
			backends: {
				cline: {
					idleNudgeTimeoutSeconds: 333,
					idleTimeoutSeconds: 444,
					model: 'cline-model',
					reasoningEffort: 'high',
				},
				codex: {
					idleNudgeTimeoutSeconds: 111,
					idleTimeoutSeconds: 222,
					model: 'codex-model',
				},
			},
			cli: 'native',
			codeModel: 'code-model',
			directAi: {
				baseUrl: 'https://api.z.ai/api/coding/paas/v4',
				enabled: true,
				model: 'glm-5.1',
				provider: 'zhipu',
				reasoningEffort: 'low',
				surfaces: {
					directorChat: true,
					directorCycle: true,
					projectAdvisor: true,
				},
				timeoutSeconds: 45,
			},
			ignoredFolders: ['node_modules', 'generated'],
			initModel: 'init-model',
			model: 'shared-model',
			reasoningEffort: 'medium',
			traceDataMovement: false,
			triumvirate: {
				execCli: 'native',
				execModel: 'exec-model',
				overseerCli: 'opencode',
				overseerModel: 'overseer-model',
				secondaryCli: 'codex',
				secondaryModel: 'secondary-model',
			},
		});
		const written = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;

		expect(written).not.toHaveProperty('apiKey');
		expect(written.providers).toEqual({
			zhipu: {
				apiKey: 'provider-secret',
				baseUrl: 'https://api.z.ai/api/coding/paas/v4',
				model: 'glm-5.1',
			},
		});
		expect(written.sharedDirs).toEqual(['D:/shared']);
		expect((written.web as { traceDataMovement?: boolean }).traceDataMovement).toBe(false);
		expect(written.directAi).toMatchObject({
			baseUrl: 'https://api.z.ai/api/coding/paas/v4',
			enabled: true,
			model: 'glm-5.1',
			provider: 'zhipu',
			reasoningEffort: 'low',
			timeoutSeconds: 45,
		});
		expect(result.config.directAi.apiKeyConfigured).toBe(true);
		expect('apiKey' in result.config.directAi).toBe(false);
		expect(written.triumvirate).toEqual({
			execCli: 'native',
			execModel: 'exec-model',
			overseerCli: 'opencode',
			overseerModel: 'overseer-model',
			secondaryCli: 'codex',
			secondaryModel: 'secondary-model',
		});
		expect(result.config.triumvirate).toEqual({
			execCli: 'native',
			execModel: 'exec-model',
			overseerCli: 'opencode',
			overseerModel: 'overseer-model',
			secondaryCli: 'codex',
			secondaryModel: 'secondary-model',
		});
		expect(written.cli).toBe('native');
		expect(result.config.applicationRoots).toEqual([resolve(allowedRoot)]);
		expect(result.config.ignoredFolders).toEqual(['node_modules', 'generated']);
		expect(result.config.backends.cline).toEqual({
			idleNudgeTimeoutSeconds: 333,
			idleTimeoutSeconds: 444,
			model: 'cline-model',
			reasoningEffort: 'high',
		});
		expect(result.config.backends.codex?.model).toBe('codex-model');
		expect(result.resolvedConfig.web.dataDir).toBe(web.dataDir);
		expect(result.resolvedConfig.web.port).toBe(web.port);
		expect(result.config.traceDataMovement).toBe(false);
		expect(result.resolvedConfig.web.traceDataMovement).toBe(false);

		await rm(workspace, { force: true, recursive: true });
	});

	test('writes config file with 0600 permissions (BREAK-THE-ASSUMPTION)', async () => {
		const workspace = await testTempDir('aidd-web-settings-perms-');
		const configPath = join(workspace, 'config.json');
		const allowedRoot = join(workspace, 'apps');
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
			traceDataMovement: false,
		};
		const service = new SettingsService(makeConfig(web), configPath);
		await service.updateConfig({
			applicationRoots: [allowedRoot],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
		});

		const statResult = await stat(configPath);
		const mode = statResult.mode & 0o777;
		// On Windows, Node.js stat reports mode 0o666 for files regardless of the
		// mode flag passed to writeFile (the OS has no Unix permissions). Only
		// enforce on POSIX where the mode flag is actually honored.
		if (process.platform !== 'win32') {
			expect(mode).toBe(0o600);
		}
		// On all platforms the file must exist and be writable by owner
		expect(mode & 0o200).toBe(0o200); // owner-write bit set

		await rm(workspace, { force: true, recursive: true });
	});

	test('rejects a Direct AI base URL pointing at a cloud metadata endpoint (SSRF guard)', async () => {
		const workspace = await testTempDir('aidd-web-settings-ssrf-');
		const configPath = join(workspace, 'config.json');
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
			traceDataMovement: false,
		};
		const service = new SettingsService(makeConfig(web), configPath);
		const baseUpdate = {
			applicationRoots: [workspace],
			cli: 'native' as const,
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low' as const,
		};

		for (const metadataUrl of [
			'http://169.254.169.254/latest/meta-data/', // literal IMDS
			'http://[::ffff:169.254.169.254]/', // IPv4-mapped IPv6
			'http://2852039166/', // decimal-encoded 169.254.169.254
			'http://100.100.100.200/', // Alibaba Cloud metadata
		]) {
			await expect(
				service.updateConfig({
					...baseUpdate,
					directAi: {
						baseUrl: metadataUrl,
						enabled: true,
						model: 'glm-5.1',
						provider: 'zhipu',
					},
				}),
			).rejects.toThrow(/cloud metadata endpoint/);
		}

		await expect(
			service.updateConfig({
				...baseUpdate,
				providers: { zhipu: { baseUrl: 'file:///etc/passwd', model: 'glm-5.1' } },
			}),
		).rejects.toThrow(/must use http or https/);

		// A loopback base URL (self-hosted LLM, e.g. Ollama) must still be accepted.
		const ok = await service.updateConfig({
			...baseUpdate,
			directAi: {
				baseUrl: 'http://127.0.0.1:11434/v1',
				enabled: true,
				model: 'llama3',
				provider: 'ollama',
			},
		});
		expect(ok.config.directAi.baseUrl).toBe('http://127.0.0.1:11434/v1');

		await rm(workspace, { force: true, recursive: true });
	});

	test('settings route accepts valid updates and rejects invalid backends', async () => {
		const workspace = await testTempDir('aidd-web-settings-route-');
		const configPath = join(workspace, 'config.json');
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
		const app = createSettingsRoutes({
			config,
			directorService: { updateConfig() {} },
			directAiService: { updateConfig() {} },
			projectService: { updateConfig() {} },
			runService: { updateConfig() {} },
			settingsService: new SettingsService(config, configPath),
		} as unknown as WebContext);
		const valid = await app.handle(
			new Request('http://localhost/api/v1/settings/config', {
				body: JSON.stringify({
					applicationRoots: [workspace],
					backends: {},
					cli: 'native',
					ignoredFolders: ['node_modules'],
					reasoningEffort: 'low',
					traceDataMovement: true,
					triumvirate: {
						execCli: 'native',
						overseerCli: 'opencode',
						secondaryCli: 'claude-code',
					},
				}),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);
		const invalid = await app.handle(
			new Request('http://localhost/api/v1/settings/config', {
				body: JSON.stringify({
					applicationRoots: [workspace],
					cli: 'not-real',
					ignoredFolders: ['node_modules'],
					reasoningEffort: 'low',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);
		const internalAlias = await app.handle(
			new Request('http://localhost/api/v1/settings/config', {
				body: JSON.stringify({
					applicationRoots: [workspace],
					cli: 'internal',
					ignoredFolders: ['node_modules'],
					reasoningEffort: 'low',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);

		expect(valid.status).toBe(200);
		expect(
			((await valid.json()) as { config: { traceDataMovement: boolean } }).config
				.traceDataMovement,
		).toBe(true);
		expect(invalid.status).toBe(422);
		expect(internalAlias.status).toBe(422);
		await rm(workspace, { force: true, recursive: true });
	});

	test('partial PUT preserves omitted fields; explicit null clears them', async () => {
		const workspace = await testTempDir('aidd-web-settings-patch-');
		const configPath = join(workspace, 'config.json');
		const appsRoot = join(workspace, 'apps');
		await writeFile(
			configPath,
			JSON.stringify({
				applicationsRoot: appsRoot,
				auditModel: 'seed-audit-model',
				auditsEnabled: false,
				codeModel: 'seed-code-model',
				initModel: 'seed-init-model',
				model: 'seed-model',
				web: {
					dataDir: join(workspace, 'data'),
					spernakitInitScript: join(workspace, 'scripts', 'init.ps1'),
				},
			}),
		);
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
			traceDataMovement: false,
		};
		const config = makeConfig(web);
		const app = createSettingsRoutes({
			config,
			directorService: { updateConfig() {} },
			directAiService: { updateConfig() {} },
			projectService: { updateConfig() {} },
			runService: { updateConfig() {} },
			settingsService: new SettingsService(config, configPath),
		} as unknown as WebContext);
		const requiredBody = {
			applicationRoots: [workspace],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
		};

		// A partial PUT that omits applicationsRoot, the model fields, auditsEnabled, and
		// spernakitInitScript must leave the stored values untouched (patch-preserve).
		const partial = await app.handle(
			new Request('http://localhost/api/v1/settings/config', {
				body: JSON.stringify(requiredBody),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);
		expect(partial.status).toBe(200);
		const afterPartial = JSON.parse(await readFile(configPath, 'utf8')) as {
			applicationsRoot?: string;
			auditModel?: string;
			auditsEnabled?: boolean;
			codeModel?: string;
			initModel?: string;
			model?: string;
			web?: { spernakitInitScript?: string };
		};
		expect(afterPartial.applicationsRoot).toBe(appsRoot);
		expect(afterPartial.model).toBe('seed-model');
		expect(afterPartial.initModel).toBe('seed-init-model');
		expect(afterPartial.codeModel).toBe('seed-code-model');
		expect(afterPartial.auditModel).toBe('seed-audit-model');
		expect(afterPartial.auditsEnabled).toBe(false);
		expect(afterPartial.web?.spernakitInitScript).toBe(join(workspace, 'scripts', 'init.ps1'));

		// Clearing requires an explicit null signal, which empties the stored fields.
		const cleared = await app.handle(
			new Request('http://localhost/api/v1/settings/config', {
				body: JSON.stringify({
					...requiredBody,
					applicationsRoot: null,
					auditModel: null,
					codeModel: null,
					initModel: null,
					model: null,
					spernakitInitScript: null,
					spernakitTemplateRef: null,
					showSpernakitProject: false,
					spernakitTemplateRepo: 'NomadicDaddy/spernakit',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);
		expect(cleared.status).toBe(200);
		const afterClear = JSON.parse(await readFile(configPath, 'utf8')) as {
			web?: { spernakitInitScript?: string };
		} & Record<string, unknown>;
		expect(afterClear).not.toHaveProperty('applicationsRoot');
		expect(afterClear).not.toHaveProperty('model');
		expect(afterClear).not.toHaveProperty('initModel');
		expect(afterClear).not.toHaveProperty('codeModel');
		expect(afterClear).not.toHaveProperty('auditModel');
		expect(afterClear.web?.spernakitInitScript).toBeUndefined();

		await rm(workspace, { force: true, recursive: true });
	});

	test('settings route notifies the Telegram bridge service after config updates', async () => {
		const workspace = await testTempDir('aidd-web-settings-telegram-route-');
		const configPath = join(workspace, 'config.json');
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
		const bridgeConfigs: ResolvedConfig[] = [];
		const app = createSettingsRoutes({
			config,
			directorService: { updateConfig() {} },
			directAiService: { updateConfig() {} },
			projectService: { updateConfig() {} },
			runService: { updateConfig() {} },
			settingsService: new SettingsService(config, configPath),
			telegramBridgeService: {
				updateConfig(updatedConfig: ResolvedConfig): Promise<void> {
					bridgeConfigs.push(updatedConfig);
					return Promise.resolve();
				},
			},
		} as unknown as WebContext);

		const response = await app.handle(
			new Request('http://localhost/api/v1/settings/config', {
				body: JSON.stringify({
					applicationRoots: [workspace],
					cli: 'native',
					ignoredFolders: ['node_modules'],
					reasoningEffort: 'low',
					telegram: {
						allowedChatIds: [123],
						botToken: 'token-route',
					},
				}),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);

		expect(response.status).toBe(200);
		expect(bridgeConfigs).toHaveLength(1);
		expect(bridgeConfigs[0]?.channels?.telegram).toEqual({
			allowedChatIds: [123],
			botToken: 'token-route',
		});

		await rm(workspace, { force: true, recursive: true });
	});

	test('persists director suggestion settings through the route body schema', async () => {
		const workspace = await testTempDir('aidd-web-settings-suggestions-');
		const configPath = join(workspace, 'config.json');
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
		const app = createSettingsRoutes({
			config,
			directorService: { updateConfig() {} },
			directAiService: { updateConfig() {} },
			projectService: { updateConfig() {} },
			runService: { updateConfig() {} },
			settingsService: new SettingsService(config, configPath),
			telegramBridgeService: { updateConfig: () => Promise.resolve() },
		} as unknown as WebContext);

		// Non-default values so the write is observable; the body schema must declare both
		// fields or Elysia strips them before the handler sees them (regression guard).
		const response = await app.handle(
			new Request('http://localhost/api/v1/settings/config', {
				body: JSON.stringify({
					applicationRoots: [workspace],
					cli: 'native',
					directorSuggestionGranularity: 'aggregate',
					directorSuggestionMaxPerBucket: 5,
					ignoredFolders: ['node_modules'],
					reasoningEffort: 'low',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			config: {
				directorSuggestionGranularity: string;
				directorSuggestionMaxPerBucket: number;
			};
		};
		expect(body.config.directorSuggestionGranularity).toBe('aggregate');
		expect(body.config.directorSuggestionMaxPerBucket).toBe(5);

		const written = JSON.parse(await readFile(configPath, 'utf8')) as {
			director?: { suggestions?: { granularity?: string; maxPerBucket?: number } };
		};
		expect(written.director?.suggestions).toEqual({
			granularity: 'aggregate',
			maxPerBucket: 5,
		});

		await rm(workspace, { force: true, recursive: true });
	});

	test('round-trips run isolation settings through settings config', async () => {
		const workspace = await testTempDir('aidd-web-settings-runs-');
		const configPath = join(workspace, 'config.json');
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
		const service = new SettingsService(makeConfig(web), configPath);

		const initial = await service.getConfig();
		expect(initial.maxConcurrentRuns).toBe(2);
		expect(initial.useWorktrees).toBe(false);

		const result = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			maxConcurrentRuns: 5,
			reasoningEffort: 'low',
			useWorktrees: true,
		});
		const written = JSON.parse(await readFile(configPath, 'utf8')) as {
			web?: { maxConcurrentRuns?: number; useWorktrees?: boolean };
		};

		expect(written.web?.maxConcurrentRuns).toBe(5);
		expect(written.web?.useWorktrees).toBe(true);
		expect(result.config.maxConcurrentRuns).toBe(5);
		expect(result.config.useWorktrees).toBe(true);
		expect(result.resolvedConfig.web.maxConcurrentRuns).toBe(5);
		expect(result.resolvedConfig.web.useWorktrees).toBe(true);

		await rm(workspace, { force: true, recursive: true });
	});

	test('generates a remote auth token when enabling remote access without one', async () => {
		const workspace = await testTempDir('aidd-web-settings-token-');
		const configPath = join(workspace, 'config.json');
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
		const service = new SettingsService(makeConfig(web), configPath);

		const result = await service.updateConfig({
			allowRemote: true,
			applicationRoots: [workspace],
			cli: 'native',
			hostname: '0.0.0.0',
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
		});
		const written = JSON.parse(await readFile(configPath, 'utf8')) as {
			web?: { authToken?: string; allowRemote?: boolean };
		};

		expect(written.web?.allowRemote).toBe(true);
		expect(written.web?.authToken).toMatch(/^[\w-]{40,}$/);
		expect(result.config.authTokenConfigured).toBe(true);
		expect(result.resolvedConfig.web.allowRemote).toBe(false);

		await rm(workspace, { force: true, recursive: true });
	});

	test('rejects invalid network host and port updates', async () => {
		const workspace = await testTempDir('aidd-web-settings-network-invalid-');
		const configPath = join(workspace, 'config.json');
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
		const service = new SettingsService(config, configPath);
		const app = createSettingsRoutes({
			config,
			directorService: { updateConfig() {} },
			directAiService: { updateConfig() {} },
			projectService: { updateConfig() {} },
			runService: { updateConfig() {} },
			settingsService: service,
		} as unknown as WebContext);

		await expect(
			service.updateConfig({
				applicationRoots: [workspace],
				cli: 'native',
				hostname: '',
				ignoredFolders: ['node_modules'],
				reasoningEffort: 'low',
			}),
		).rejects.toThrow(/web\.hostname must be a non-empty string/);

		const invalidPort = await app.handle(
			new Request('http://localhost/api/v1/settings/config', {
				body: JSON.stringify({
					applicationRoots: [workspace],
					cli: 'native',
					ignoredFolders: ['node_modules'],
					port: 0,
					reasoningEffort: 'low',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);

		expect(invalidPort.status).toBe(422);

		await rm(workspace, { force: true, recursive: true });
	});

	test('settings status routes report CLI and source-control tool health', async () => {
		const workspace = await testTempDir('aidd-web-settings-status-');
		const configPath = join(workspace, 'config.json');
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
		const calls: string[] = [];
		const runner: StatusCommandRunner = async (command, args) => {
			calls.push([command, ...args].join(' '));
			if (command === 'codex') {
				return { exitCode: 1, stderr: 'codex not found', stdout: '' };
			}
			if (command === 'gh' && args.join(' ') === 'auth status') {
				return { exitCode: 0, stderr: '', stdout: 'Logged in to github.com' };
			}
			if (command === 'glab') {
				return { exitCode: 1, stderr: 'glab not found', stdout: '' };
			}
			if (command === 'az') {
				return { exitCode: 1, stderr: 'az not found', stdout: '' };
			}
			return { exitCode: 0, stderr: '', stdout: `${command} version 1.2.3` };
		};
		const config = makeConfig(web);
		const app = createSettingsRoutes(
			{
				config,
				directorService: { updateConfig() {} },
				directAiService: { updateConfig() {} },
				projectService: { updateConfig() {} },
				runService: { updateConfig() {} },
				settingsService: new SettingsService(config, configPath),
			} as unknown as WebContext,
			{ statusCommandRunner: runner },
		);

		const cliResponse = await app.handle(
			new Request('http://localhost/api/v1/settings/cli-status'),
		);
		const sourceControlResponse = await app.handle(
			new Request('http://localhost/api/v1/settings/source-control-status'),
		);
		const cliBody = (await cliResponse.json()) as {
			backends: { backend: string; command: string; status: string }[];
		};
		const sourceControlBody = (await sourceControlResponse.json()) as {
			providers: { authStatus: string | null; id: string; status: string }[];
		};

		expect(cliResponse.status).toBe(200);
		expect(cliBody.backends.find((entry) => entry.backend === 'codex')).toMatchObject({
			command: 'codex --version',
			status: 'unavailable',
		});
		expect(cliBody.backends.find((entry) => entry.backend === 'cline')).toMatchObject({
			command: 'cline --version',
			status: 'available',
		});
		expect(cliBody.backends.find((entry) => entry.backend === 'native')).toMatchObject({
			command: 'bun --version',
			status: 'available',
		});
		expect(sourceControlResponse.status).toBe(200);
		expect(sourceControlBody.providers.find((entry) => entry.id === 'git')).toMatchObject({
			status: 'available',
		});
		expect(sourceControlBody.providers.find((entry) => entry.id === 'github')).toMatchObject({
			authStatus: 'Authenticated',
			status: 'available',
		});
		expect(calls).toContain('gh auth status');

		await rm(workspace, { force: true, recursive: true });
	});

	test('settings status routes cache probes until a refresh is requested', async () => {
		const workspace = await testTempDir('aidd-web-settings-status-cache-');
		const configPath = join(workspace, 'config.json');
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
		let probes = 0;
		const runner: StatusCommandRunner = async (command, args) => {
			probes += 1;
			return { exitCode: 0, stderr: '', stdout: `${command} ${args.join(' ')} 1.2.3` };
		};
		const config = makeConfig(web);
		const app = createSettingsRoutes(
			{
				config,
				directorService: { updateConfig() {} },
				directAiService: { updateConfig() {} },
				projectService: { updateConfig() {} },
				runService: { updateConfig() {} },
				settingsService: new SettingsService(config, configPath),
			} as unknown as WebContext,
			{ statusCommandRunner: runner },
		);

		const first = await app.handle(new Request('http://localhost/api/v1/settings/cli-status'));
		expect(first.status).toBe(200);
		const afterFirst = probes;
		expect(afterFirst).toBeGreaterThan(0);

		// A plain reload — the case that used to spawn the whole subprocess fleet again.
		const second = await app.handle(new Request('http://localhost/api/v1/settings/cli-status'));
		expect(second.status).toBe(200);
		expect(probes).toBe(afterFirst);
		expect(await second.json()).toEqual(await first.json());

		// The panel's Refresh control is the only thing that pays for a re-probe.
		const refreshed = await app.handle(
			new Request('http://localhost/api/v1/settings/cli-status?refresh=true'),
		);
		expect(refreshed.status).toBe(200);
		expect(probes).toBe(afterFirst * 2);

		// Source control is cached independently, so refreshing one panel does not
		// silently re-probe the other.
		const beforeSourceControl = probes;
		await app.handle(new Request('http://localhost/api/v1/settings/source-control-status'));
		const afterSourceControl = probes;
		expect(afterSourceControl).toBeGreaterThan(beforeSourceControl);
		await app.handle(new Request('http://localhost/api/v1/settings/source-control-status'));
		expect(probes).toBe(afterSourceControl);

		await rm(workspace, { force: true, recursive: true });
	});

	test('settings status routes probe at construction only when warm-start is enabled', async () => {
		const workspace = await testTempDir('aidd-web-settings-status-warm-');
		const configPath = join(workspace, 'config.json');
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
		const buildApp = (warm: boolean, counts: Map<string, number>) =>
			createSettingsRoutes(
				{
					config,
					directorService: { updateConfig() {} },
					directAiService: { updateConfig() {} },
					projectService: { updateConfig() {} },
					runService: { updateConfig() {} },
					settingsService: new SettingsService(config, configPath),
				} as unknown as WebContext,
				{
					statusCommandRunner: async (command, args) => {
						counts.set(command, (counts.get(command) ?? 0) + 1);
						return {
							exitCode: 0,
							stderr: '',
							stdout: `${command} ${args.join(' ')} 1.2.3`,
						};
					},
					warmStatusCache: warm,
				},
			);

		// Control: without the flag nothing is spawned until a request arrives, so the option
		// is what moves the subprocess fleet off the request path rather than something the
		// route did anyway.
		const coldCounts = new Map<string, number>();
		buildApp(false, coldCounts);
		await Bun.sleep(0);
		expect(coldCounts.get('codex') ?? 0).toBe(0);

		const warmCounts = new Map<string, number>();
		const warmApp = buildApp(true, warmCounts);
		await Bun.sleep(0);
		expect(warmCounts.get('codex')).toBe(1);

		// The first Settings visit reads the boot probe instead of paying for its own.
		const first = await warmApp.handle(
			new Request('http://localhost/api/v1/settings/cli-status'),
		);
		expect(first.status).toBe(200);
		expect(warmCounts.get('codex')).toBe(1);

		const refreshed = await warmApp.handle(
			new Request('http://localhost/api/v1/settings/cli-status?refresh=true'),
		);
		expect(refreshed.status).toBe(200);
		expect(warmCounts.get('codex')).toBe(2);

		// The option only warms anything if the server actually passes it; there is no cheap
		// way to boot the real listener here, so assert the wiring at its single call site.
		const serverSource = await Bun.file(
			resolve(import.meta.dir, '..', '..', 'backend', 'src', 'server.ts'),
		).text();
		expect(serverSource).toContain('createSettingsRoutes(context, { warmStatusCache: true })');

		await rm(workspace, { force: true, recursive: true });
	});

	test('normalizes persisted ignoredFolders containing blank and duplicate values on read', async () => {
		const workspace = await testTempDir('aidd-web-settings-blanks-');
		const configPath = join(workspace, 'config.json');
		await Bun.write(
			configPath,
			JSON.stringify({
				web: {
					allowedRoots: [workspace],
					dataDir: join(workspace, 'data', 'settings-blanks-test'),
					hostname: '127.0.0.1',
					ignoredFolders: ['', '   ', 'node_modules', '  node_modules  ', '\t', '.git'],
					maxConcurrentRuns: 2,
					maxConcurrentRunsPerProject: 2,
					useWorktrees: false,
					port: 3210,
					traceDataMovement: true,
				},
			}),
		);
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
		const service = new SettingsService(makeConfig(web), configPath);

		const dto = await service.getConfig();
		expect(dto.ignoredFolders).toEqual(['node_modules', '.git']);
		expect(dto.ignoredFolders.every((value) => value.trim().length > 0)).toBe(true);
		expect(dto.traceDataMovement).toBe(true);

		await rm(workspace, { force: true, recursive: true });
	});

	test('writes Direct AI apiKey to providers, omits it from DTO, and validates pre-flight', async () => {
		const workspace = await testTempDir('aidd-web-settings-directai-');
		const configPath = join(workspace, 'home', '.aidd', 'config.json');
		await mkdir(join(configPath, '..'), { recursive: true });
		await Bun.write(
			configPath,
			JSON.stringify({
				web: {
					dataDir: join(workspace, 'data'),
					maxConcurrentRuns: 2,
					maxConcurrentRunsPerProject: 2,
					useWorktrees: false,
					port: 3210,
				},
			}),
		);
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
		const service = new SettingsService(makeConfig(web), configPath);

		await expect(
			service.updateConfig({
				applicationRoots: [workspace],
				cli: 'native',
				directAi: {
					enabled: true,
					provider: 'zhipu',
					surfaces: {
						directorChat: true,
						directorCycle: true,
						projectAdvisor: true,
					},
				},
				ignoredFolders: ['node_modules'],
				reasoningEffort: 'low',
			}),
		).rejects.toThrow(/API key/);

		const result = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			directAi: {
				apiKey: 'new-secret',
				baseUrl: 'https://api.z.ai/api/coding/paas/v4',
				enabled: true,
				model: 'glm-5.1',
				provider: 'zhipu',
				surfaces: {
					directorChat: true,
					directorCycle: true,
					projectAdvisor: true,
				},
			},
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
		});
		const written = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
		expect((written.providers as Record<string, { apiKey?: string }>).zhipu?.apiKey).toBe(
			'new-secret',
		);
		expect(result.config.directAi.apiKeyConfigured).toBe(true);
		expect('apiKey' in result.config.directAi).toBe(false);

		const preserved = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			directAi: {
				baseUrl: 'https://api.z.ai/api/coding/paas/v4',
				enabled: true,
				model: 'glm-5.1',
				provider: 'zhipu',
				surfaces: {
					directorChat: true,
					directorCycle: true,
					projectAdvisor: true,
				},
			},
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
		});
		const writtenAgain = JSON.parse(await readFile(configPath, 'utf8')) as Record<
			string,
			unknown
		>;
		expect((writtenAgain.providers as Record<string, { apiKey?: string }>).zhipu?.apiKey).toBe(
			'new-secret',
		);
		expect(preserved.config.directAi.apiKeyConfigured).toBe(true);

		const cleared = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			directAi: {
				apiKey: '',
				baseUrl: 'https://api.z.ai/api/coding/paas/v4',
				enabled: false,
				model: 'glm-5.1',
				provider: 'zhipu',
				surfaces: {
					directorChat: false,
					directorCycle: false,
					projectAdvisor: false,
				},
			},
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
		});
		const writtenCleared = JSON.parse(await readFile(configPath, 'utf8')) as Record<
			string,
			unknown
		>;
		const providersAfterClear = writtenCleared.providers as
			Record<string, { apiKey?: string }> | undefined;
		expect(providersAfterClear?.zhipu?.apiKey).toBeUndefined();
		expect(cleared.config.directAi.apiKeyConfigured).toBe(false);

		await rm(workspace, { force: true, recursive: true });
	});

	test('persists network fields while keeping active listener restart-bound', async () => {
		const workspace = await testTempDir('aidd-web-settings-preserve-');
		const configPath = join(workspace, 'config.json');
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
		// Remote binding requires an auth token, so seed one in the persisted config.
		await writeFile(
			configPath,
			`${JSON.stringify({ web: { authToken: 'secret-token' } }, null, '\t')}\n`,
		);
		const service = new SettingsService(makeConfig(web), configPath);

		const result = await service.updateConfig({
			allowedOrigins: [' http://demo-host:3210 ', 'http://192.0.2.10:3210/'],
			allowRemote: true,
			applicationRoots: [workspace],
			cli: 'native',
			hostname: '0.0.0.0',
			ignoredFolders: ['node_modules'],
			port: 4555,
			reasoningEffort: 'low',
		});
		const written = JSON.parse(await readFile(configPath, 'utf8')) as {
			web?: {
				allowedOrigins?: string[];
				allowRemote?: boolean;
				hostname?: string;
				port?: number;
			};
		};

		expect(written.web?.allowedOrigins).toEqual([
			'http://demo-host:3210',
			'http://192.0.2.10:3210',
		]);
		expect(written.web?.allowRemote).toBe(true);
		expect(written.web?.hostname).toBe('0.0.0.0');
		expect(written.web?.port).toBe(4555);
		expect(result.config.allowedOrigins).toEqual([
			'http://demo-host:3210',
			'http://192.0.2.10:3210',
		]);
		expect(result.config.allowRemote).toBe(true);
		expect(result.config.hostname).toBe('0.0.0.0');
		expect(result.config.port).toBe(4555);
		expect(result.resolvedConfig.web.allowedOrigins).toEqual([]);
		expect(result.resolvedConfig.web.hostname).toBe('127.0.0.1');
		expect(result.resolvedConfig.web.allowRemote).toBe(false);
		expect(result.resolvedConfig.web.dataDir).toBe(web.dataDir);
		expect(result.resolvedConfig.web.port).toBe(web.port);

		await rm(workspace, { force: true, recursive: true });
	});

	test('rejects malformed allowed origins with config validation message', async () => {
		const workspace = await testTempDir('aidd-web-settings-origin-invalid-');
		const configPath = join(workspace, 'config.json');
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
		const service = new SettingsService(makeConfig(web), configPath);

		await expect(
			service.updateConfig({
				allowedOrigins: ['not a url'],
				applicationRoots: [workspace],
				cli: 'native',
				ignoredFolders: ['node_modules'],
				reasoningEffort: 'low',
			}),
		).rejects.toThrow(/web\.allowedOrigins entry "not a url" is invalid/);

		await rm(workspace, { force: true, recursive: true });
	});

	test('round-trips director auto-cycle settings without clobbering chat file-edits', async () => {
		const workspace = await testTempDir('aidd-web-settings-autocycle-');
		const configPath = join(workspace, 'config.json');
		// Seed an existing director.chat.allowFileEdits so we can prove the
		// auto-cycle write merges into director rather than replacing it.
		await Bun.write(
			configPath,
			JSON.stringify({ director: { chat: { allowFileEdits: true } } }),
		);
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
		const service = new SettingsService(makeConfig(web), configPath);

		const result = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			directorAutoCycleEnabled: true,
			directorAutoCycleIntervalHours: 6,
			directorChatAllowFileEdits: true,
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
		});

		expect(result.config.directorAutoCycleEnabled).toBe(true);
		expect(result.config.directorAutoCycleIntervalHours).toBe(6);
		expect(result.config.directorChatAllowFileEdits).toBe(true);

		const written = JSON.parse(await readFile(configPath, 'utf8')) as {
			director?: {
				chat?: { allowFileEdits?: boolean };
				schedule?: Record<string, unknown>;
			};
		};
		expect(written.director?.chat?.allowFileEdits).toBe(true);
		expect(written.director?.schedule).toEqual({ enabled: true, intervalHours: 6 });

		// Disabling auto-cycle while restoring the default interval keeps the schedule
		// block written (enabled:false) rather than dropping it — the whole director block
		// is persisted unconditionally so no keys disappear from config.json — and the chat
		// file-edits toggle is preserved.
		const cleared = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			directorAutoCycleEnabled: false,
			directorAutoCycleIntervalHours: 12,
			directorChatAllowFileEdits: true,
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
		});
		expect(cleared.config.directorAutoCycleEnabled).toBe(false);
		expect(cleared.config.directorAutoCycleIntervalHours).toBe(12);
		const written2 = JSON.parse(await readFile(configPath, 'utf8')) as {
			director?: { chat?: { allowFileEdits?: boolean }; schedule?: unknown };
		};
		expect(written2.director?.chat?.allowFileEdits).toBe(true);
		expect(written2.director?.schedule).toEqual({ enabled: false, intervalHours: 12 });

		await rm(workspace, { force: true, recursive: true });
	});

	test('round-trips runSummaries surface through settings config', async () => {
		const workspace = await testTempDir('aidd-web-settings-runsummaries-');
		const configPath = join(workspace, 'config.json');
		await Bun.write(
			configPath,
			JSON.stringify({
				providers: { zhipu: { apiKey: 'test-key' } },
			}),
		);
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
		const service = new SettingsService(config, configPath);
		const app = createSettingsRoutes({
			config,
			directorService: { updateConfig() {} },
			directAiService: { updateConfig() {} },
			projectService: { updateConfig() {} },
			runService: { updateConfig() {} },
			settingsService: service,
		} as unknown as WebContext);

		const response = await app.handle(
			new Request('http://localhost/api/v1/settings/config', {
				body: JSON.stringify({
					applicationRoots: [workspace],
					cli: 'native',
					directAi: {
						enabled: true,
						provider: 'zhipu',
						surfaces: {
							directorChat: true,
							directorCycle: false,
							projectAdvisor: true,
							runSummaries: true,
						},
					},
					ignoredFolders: ['node_modules'],
					reasoningEffort: 'low',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			config: { directAi: { surfaces: Record<string, boolean> } };
		};
		expect(body.config.directAi.surfaces.runSummaries).toBe(true);
		expect(body.config.directAi.surfaces.directorCycle).toBe(false);

		const written = JSON.parse(await readFile(configPath, 'utf8')) as {
			directAi?: { surfaces?: { runSummaries?: boolean } };
		};
		expect(written.directAi?.surfaces?.runSummaries).toBe(true);

		await rm(workspace, { force: true, recursive: true });
	});

	test('round-trips applicationsRoot separately from applicationRoots', async () => {
		const workspace = await testTempDir('aidd-web-settings-approot-');
		const configPath = join(workspace, 'config.json');
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
		const service = new SettingsService(makeConfig(web), configPath);

		// Initial config has no applicationsRoot
		const initial = await service.getConfig();
		expect(initial.applicationsRoot).toBeNull();

		// Set applicationsRoot to a distinct path, separate from applicationRoots
		const appsRoot = join(workspace, 'applications');
		const result = await service.updateConfig({
			applicationsRoot: appsRoot,
			applicationRoots: [workspace],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
		});
		const written = JSON.parse(await readFile(configPath, 'utf8')) as {
			applicationsRoot?: string;
			web?: { allowedRoots?: string[] };
		};

		expect(written.applicationsRoot).toBe(appsRoot);
		expect(written.web?.allowedRoots).toEqual([workspace]);
		expect(result.config.applicationsRoot).toBe(appsRoot);
		expect(result.config.applicationRoots).toEqual([workspace]);

		// Clearing applicationsRoot should not affect applicationRoots
		const cleared = await service.updateConfig({
			applicationsRoot: null,
			applicationRoots: [workspace, join(workspace, 'extra')],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
		});
		const writtenCleared = JSON.parse(await readFile(configPath, 'utf8')) as {
			applicationsRoot?: string;
			web?: { allowedRoots?: string[] };
		};

		expect(writtenCleared.applicationsRoot).toBeUndefined();
		expect(writtenCleared.web?.allowedRoots).toEqual([workspace, join(workspace, 'extra')]);
		expect(cleared.config.applicationsRoot).toBeNull();
		expect(cleared.config.applicationRoots).toEqual([workspace, join(workspace, 'extra')]);

		await rm(workspace, { force: true, recursive: true });
	});

	test('round-trips defaultProvider and provider config through settings', async () => {
		const workspace = await testTempDir('aidd-web-settings-providers-');
		const configPath = join(workspace, 'config.json');
		// Seed existing providers with an API key and other fields
		await Bun.write(
			configPath,
			JSON.stringify({
				defaultProvider: 'zhipu',
				providers: {
					zhipu: {
						apiKey: 'existing-secret',
						baseUrl: 'https://api.z.ai/api/coding/paas/v4',
						model: 'glm-5.1',
					},
					xai: {
						apiKey: 'xai-secret',
						baseUrl: 'https://api.x.ai/v1',
						model: 'grok-4.5',
					},
				},
			}),
		);
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
		const service = new SettingsService(makeConfig(web), configPath);

		// GET should return providers with API keys masked
		const initial = await service.getConfig();
		expect(initial.defaultProvider).toBe('zhipu');
		expect(Object.keys(initial.providers)).toEqual(['zhipu', 'xai']);
		expect(initial.providers.zhipu).toEqual({
			apiKeyConfigured: true,
			baseUrl: 'https://api.z.ai/api/coding/paas/v4',
			model: 'glm-5.1',
			reasoningEffort: null,
		});
		expect('apiKey' in initial.providers.zhipu!).toBe(false);
		expect(initial.providers.xai!.apiKeyConfigured).toBe(true);

		// Update provider fields, preserving API keys when not set
		const result = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			defaultProvider: 'xai',
			ignoredFolders: ['node_modules'],
			providers: {
				zhipu: {
					baseUrl: 'https://api.z.ai/api/coding/paas/v4',
					model: 'glm-5.2',
					reasoningEffort: null,
				},
				xai: {
					baseUrl: 'https://api.x.ai/v1',
					model: 'grok-4.5',
					reasoningEffort: null,
				},
			},
			reasoningEffort: 'low',
		});
		const written = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;

		// API keys should be preserved since they weren't sent
		expect((written.providers as Record<string, { apiKey?: string }>).zhipu?.apiKey).toBe(
			'existing-secret',
		);
		expect((written.providers as Record<string, { apiKey?: string }>).xai?.apiKey).toBe(
			'xai-secret',
		);
		expect((written.providers as Record<string, { model?: string }>).zhipu?.model).toBe(
			'glm-5.2',
		);
		expect(written.defaultProvider).toBe('xai');
		expect(result.config.defaultProvider).toBe('xai');
		expect(result.config.providers.zhipu!.model).toBe('glm-5.2');
		expect(result.config.providers.zhipu!.apiKeyConfigured).toBe(true);
		expect('apiKey' in result.config.providers.zhipu!).toBe(false);

		// Clear defaultProvider should remove it
		const cleared = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			defaultProvider: null,
			ignoredFolders: ['node_modules'],
			providers: {
				zhipu: {
					baseUrl: 'https://api.z.ai/api/coding/paas/v4',
					model: 'glm-5.2',
					reasoningEffort: null,
				},
				xai: {
					baseUrl: 'https://api.x.ai/v1',
					model: 'grok-4.5',
					reasoningEffort: null,
				},
			},
			reasoningEffort: 'low',
		});
		const writtenCleared = JSON.parse(await readFile(configPath, 'utf8')) as {
			defaultProvider?: string;
		};
		expect(writtenCleared.defaultProvider).toBeUndefined();
		expect(cleared.config.defaultProvider).toBeNull();

		await rm(workspace, { force: true, recursive: true });
	});

	test('preserves provider streaming controls and absent providers through settings save', async () => {
		const workspace = await testTempDir('aidd-web-settings-provider-stream-');
		const configPath = join(workspace, 'config.json');
		// Seed providers with JSON-only streaming controls (stream, streamIdleTimeoutMs)
		// plus a provider the frontend does not manage (to verify it survives a save).
		await Bun.write(
			configPath,
			JSON.stringify({
				providers: {
					openai: {
						apiKey: 'openai-secret',
						baseUrl: 'https://api.openai.com/v1',
						model: 'gpt-5.6',
						stream: false,
						streamIdleTimeoutMs: 30_000,
					},
					custom: {
						apiKey: 'custom-secret',
						baseUrl: 'https://custom.example.com/v1',
						model: 'custom-model',
					},
				},
			}),
		);
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
		const service = new SettingsService(makeConfig(web), configPath);

		// The frontend sends only the managed fields (apiKey omitted since it was
		// not re-entered); the "custom" provider is absent from the input entirely.
		const result = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			providers: {
				openai: {
					baseUrl: 'https://api.openai.com/v1',
					model: 'gpt-5.6',
					reasoningEffort: null,
				},
			},
			reasoningEffort: 'low',
		});
		const written = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
		const writtenProviders = written.providers as Record<string, Record<string, unknown>>;

		// Streaming controls must survive the save (regression: they were silently dropped).
		expect(writtenProviders.openai?.stream).toBe(false);
		expect(writtenProviders.openai?.streamIdleTimeoutMs).toBe(30_000);
		// API key preserved since it was not re-entered.
		expect(writtenProviders.openai?.apiKey).toBe('openai-secret');

		// A provider absent from the input must survive the save.
		expect(writtenProviders.custom?.apiKey).toBe('custom-secret');
		expect(writtenProviders.custom?.model).toBe('custom-model');

		// The DTO should reflect the preserved provider.
		expect(result.config.providers.openai?.apiKeyConfigured).toBe(true);
		expect('apiKey' in (result.config.providers.openai ?? {})).toBe(false);

		await rm(workspace, { force: true, recursive: true });
	});

	test('clears provider API key when explicitly sent as null', async () => {
		const workspace = await testTempDir('aidd-web-settings-provider-clear-');
		const configPath = join(workspace, 'config.json');
		await Bun.write(
			configPath,
			JSON.stringify({
				providers: {
					zhipu: {
						apiKey: 'secret-to-clear',
						baseUrl: 'https://api.z.ai/api/coding/paas/v4',
						model: 'glm-5.1',
					},
				},
			}),
		);
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
		const service = new SettingsService(makeConfig(web), configPath);

		const result = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			providers: {
				zhipu: {
					apiKey: null,
					baseUrl: 'https://api.z.ai/api/coding/paas/v4',
					model: 'glm-5.1',
					reasoningEffort: null,
				},
			},
			reasoningEffort: 'low',
		});
		const written = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;

		expect(
			(written.providers as Record<string, { apiKey?: string }>).zhipu?.apiKey,
		).toBeUndefined();
		expect(result.config.providers.zhipu!.apiKeyConfigured).toBe(false);

		await rm(workspace, { force: true, recursive: true });
	});

	test('round-trips runtime defaults through settings config', async () => {
		const workspace = await testTempDir('aidd-web-settings-runtime-');
		const configPath = join(workspace, 'config.json');
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
		const service = new SettingsService(makeConfig(web), configPath);

		// Initial config has no runtime overrides — DTO should return null for all
		const initial = await service.getConfig();
		expect(initial.timeoutSeconds).toBeNull();
		expect(initial.maxIterations).toBeNull();
		expect(initial.maxTurns).toBeNull();
		expect(initial.dirtyTreeThreshold).toBeNull();
		expect(initial.idleTimeoutSeconds).toBeNull();
		expect(initial.idleNudgeTimeoutSeconds).toBeNull();
		expect(initial.noWorkBackoffMs).toBeNull();
		expect(initial.quitOnAbort).toBeNull();
		expect(initial.rateLimitBackoffSeconds).toBeNull();
		expect(initial.rateLimitBufferSeconds).toBeNull();
		expect(initial.noClean).toBe(false);

		// Set all runtime defaults
		const result = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			dirtyTreeThreshold: 100,
			idleNudgeTimeoutSeconds: 120,
			idleTimeoutSeconds: 300,
			ignoredFolders: ['node_modules'],
			maxIterations: 5,
			maxTurns: 10,
			noClean: true,
			noWorkBackoffMs: 60_000,
			quitOnAbort: 3,
			rateLimitBackoffSeconds: 600,
			rateLimitBufferSeconds: 120,
			reasoningEffort: 'low',
			timeoutSeconds: 7200,
		});
		const written = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;

		// All values persisted in config.json
		expect(written.timeoutSeconds).toBe(7200);
		expect(written.maxIterations).toBe(5);
		expect(written.maxTurns).toBe(10);
		expect(written.dirtyTreeThreshold).toBe(100);
		expect(written.idleTimeoutSeconds).toBe(300);
		expect(written.idleNudgeTimeoutSeconds).toBe(120);
		expect(written.noWorkBackoffMs).toBe(60_000);
		expect(written.quitOnAbort).toBe(3);
		expect(written.rateLimitBackoffSeconds).toBe(600);
		expect(written.rateLimitBufferSeconds).toBe(120);
		expect(written.noClean).toBe(true);

		// DTO returns the configured values
		expect(result.config.timeoutSeconds).toBe(7200);
		expect(result.config.maxIterations).toBe(5);
		expect(result.config.maxTurns).toBe(10);
		expect(result.config.dirtyTreeThreshold).toBe(100);
		expect(result.config.idleTimeoutSeconds).toBe(300);
		expect(result.config.idleNudgeTimeoutSeconds).toBe(120);
		expect(result.config.noWorkBackoffMs).toBe(60_000);
		expect(result.config.quitOnAbort).toBe(3);
		expect(result.config.rateLimitBackoffSeconds).toBe(600);
		expect(result.config.rateLimitBufferSeconds).toBe(120);
		expect(result.config.noClean).toBe(true);

		// Resolved config picks up the values
		expect(result.resolvedConfig.timeoutSeconds).toBe(7200);
		expect(result.resolvedConfig.maxIterations).toBe(5);
		expect(result.resolvedConfig.dirtyTreeThreshold).toBe(100);
		expect(result.resolvedConfig.idleTimeoutSeconds).toBe(300);
		expect(result.resolvedConfig.idleNudgeTimeoutSeconds).toBe(120);
		expect(result.resolvedConfig.noWorkBackoffMs).toBe(60_000);
		expect(result.resolvedConfig.quitOnAbort).toBe(3);
		expect(result.resolvedConfig.rateLimitBackoffSeconds).toBe(600);
		expect(result.resolvedConfig.rateLimitBufferSeconds).toBe(120);
		expect(result.resolvedConfig.noClean).toBe(true);

		// Clear all runtime defaults (set to null)
		const cleared = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			dirtyTreeThreshold: null,
			idleNudgeTimeoutSeconds: null,
			idleTimeoutSeconds: null,
			ignoredFolders: ['node_modules'],
			maxIterations: null,
			maxTurns: null,
			noClean: false,
			noWorkBackoffMs: null,
			quitOnAbort: null,
			rateLimitBackoffSeconds: null,
			rateLimitBufferSeconds: null,
			reasoningEffort: 'low',
			timeoutSeconds: null,
		});
		const writtenCleared = JSON.parse(await readFile(configPath, 'utf8')) as Record<
			string,
			unknown
		>;

		// Cleared keys should not be in config.json (falls back to built-in defaults)
		expect(writtenCleared.timeoutSeconds).toBeUndefined();
		expect(writtenCleared.maxIterations).toBeUndefined();
		expect(writtenCleared.maxTurns).toBeUndefined();
		expect(writtenCleared.dirtyTreeThreshold).toBeUndefined();
		expect(writtenCleared.idleTimeoutSeconds).toBeUndefined();
		expect(writtenCleared.idleNudgeTimeoutSeconds).toBeUndefined();
		expect(writtenCleared.noWorkBackoffMs).toBeUndefined();
		expect(writtenCleared.quitOnAbort).toBeUndefined();
		expect(writtenCleared.rateLimitBackoffSeconds).toBeUndefined();
		expect(writtenCleared.rateLimitBufferSeconds).toBeUndefined();

		// DTO returns null for cleared values
		expect(cleared.config.timeoutSeconds).toBeNull();
		expect(cleared.config.maxIterations).toBeNull();
		expect(cleared.config.maxTurns).toBeNull();
		expect(cleared.config.dirtyTreeThreshold).toBeNull();
		expect(cleared.config.idleTimeoutSeconds).toBeNull();
		expect(cleared.config.idleNudgeTimeoutSeconds).toBeNull();
		expect(cleared.config.noWorkBackoffMs).toBeNull();
		expect(cleared.config.quitOnAbort).toBeNull();
		expect(cleared.config.rateLimitBackoffSeconds).toBeNull();
		expect(cleared.config.rateLimitBufferSeconds).toBeNull();
		expect(cleared.config.noClean).toBe(false);

		// Resolved config falls back to built-in defaults
		expect(cleared.resolvedConfig.timeoutSeconds).toBe(10_800);
		expect(cleared.resolvedConfig.dirtyTreeThreshold).toBe(50);
		expect(cleared.resolvedConfig.idleTimeoutSeconds).toBe(900);
		expect(cleared.resolvedConfig.idleNudgeTimeoutSeconds).toBe(600);
		expect(cleared.resolvedConfig.noWorkBackoffMs).toBe(30_000);
		expect(cleared.resolvedConfig.quitOnAbort).toBe(0);
		expect(cleared.resolvedConfig.rateLimitBackoffSeconds).toBe(300);
		expect(cleared.resolvedConfig.rateLimitBufferSeconds).toBe(60);
		expect(cleared.resolvedConfig.noClean).toBe(false);

		await rm(workspace, { force: true, recursive: true });
	});

	test('runtime defaults route accepts valid values and rejects negative numbers', async () => {
		const workspace = await testTempDir('aidd-web-settings-runtime-route-');
		const configPath = join(workspace, 'config.json');
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
		const app = createSettingsRoutes({
			config,
			directorService: { updateConfig() {} },
			directAiService: { updateConfig() {} },
			projectService: { updateConfig() {} },
			runService: { updateConfig() {} },
			settingsService: new SettingsService(config, configPath),
		} as unknown as WebContext);

		const valid = await app.handle(
			new Request('http://localhost/api/v1/settings/config', {
				body: JSON.stringify({
					applicationRoots: [workspace],
					cli: 'native',
					dirtyTreeThreshold: 75,
					ignoredFolders: ['node_modules'],
					maxIterations: 3,
					maxTurns: 15,
					noClean: true,
					rateLimitBackoffSeconds: 120,
					reasoningEffort: 'low',
					showSpernakitProject: true,
					timeoutSeconds: 1800,
					useWorktrees: true,
				}),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);
		expect(valid.status).toBe(200);
		const validBody = (await valid.json()) as {
			config: {
				dirtyTreeThreshold: null | number;
				maxIterations: null | number;
				maxTurns: null | number;
				noClean: boolean;
				rateLimitBackoffSeconds: null | number;
				showSpernakitProject: boolean;
				timeoutSeconds: null | number;
				useWorktrees: boolean;
			};
		};
		expect(validBody.config.timeoutSeconds).toBe(1800);
		expect(validBody.config.maxIterations).toBe(3);
		expect(validBody.config.maxTurns).toBe(15);
		expect(validBody.config.dirtyTreeThreshold).toBe(75);
		expect(validBody.config.noClean).toBe(true);
		expect(validBody.config.rateLimitBackoffSeconds).toBe(120);
		expect(validBody.config.showSpernakitProject).toBe(true);
		expect(validBody.config.useWorktrees).toBe(true);

		// Negative values should be rejected by the route body schema
		const invalid = await app.handle(
			new Request('http://localhost/api/v1/settings/config', {
				body: JSON.stringify({
					applicationRoots: [workspace],
					cli: 'native',
					ignoredFolders: ['node_modules'],
					maxTurns: -1,
					reasoningEffort: 'low',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'PUT',
			}),
		);
		expect(invalid.status).toBe(422);

		await rm(workspace, { force: true, recursive: true });
	});

	test('round-trips sharedDirs and sharedFiles through settings config', async () => {
		const workspace = await testTempDir('aidd-web-settings-shared-meta-');
		const configPath = join(workspace, 'config.json');
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
		const service = new SettingsService(makeConfig(web), configPath);

		// Initial state: no sharedDirs or sharedFiles
		const initial = await service.getConfig();
		expect(initial.sharedDirs).toEqual([]);
		expect(initial.sharedFiles).toEqual([]);

		// Set sharedDirs and sharedFiles
		const result = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
			sharedDirs: ['/shared/templates', '/shared/config'],
			sharedFiles: [
				{ source: '/shared/README.md', target: 'README.md' },
				{ source: '/shared/.editorconfig' },
				{ source: '/shared/.gitignore', target: null },
			],
		});

		expect(result.config.sharedDirs).toEqual(['/shared/templates', '/shared/config']);
		expect(result.config.sharedFiles).toEqual([
			{ source: '/shared/README.md', target: 'README.md' },
			{ source: '/shared/.editorconfig', target: null },
			{ source: '/shared/.gitignore', target: null },
		]);

		const written = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
		expect(written.sharedDirs).toEqual(['/shared/templates', '/shared/config']);
		// sharedFiles entries without target should be stored as plain strings
		expect(written.sharedFiles).toEqual([
			{ source: '/shared/README.md', target: 'README.md' },
			'/shared/.editorconfig',
			'/shared/.gitignore',
		]);

		// Clear sharedDirs and sharedFiles
		const cleared = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
			sharedDirs: [],
			sharedFiles: [],
		});
		expect(cleared.config.sharedDirs).toEqual([]);
		expect(cleared.config.sharedFiles).toEqual([]);

		const writtenCleared = JSON.parse(await readFile(configPath, 'utf8')) as Record<
			string,
			unknown
		>;
		expect(writtenCleared.sharedDirs).toBeUndefined();
		expect(writtenCleared.sharedFiles).toBeUndefined();

		await rm(workspace, { force: true, recursive: true });
	});

	test('round-trips telegram channel settings through settings config', async () => {
		const workspace = await testTempDir('aidd-web-settings-telegram-');
		const configPath = join(workspace, 'config.json');
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
		const service = new SettingsService(makeConfig(web), configPath);

		// Initial state: no telegram config
		const initial = await service.getConfig();
		expect(initial.telegram).toEqual({ allowedChatIds: [], botTokenConfigured: false });

		// Set bot token and allowed chat IDs
		const result = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
			telegram: {
				allowedChatIds: [123456789, -1001234567890],
				botToken: '123456:ABC-DEF',
			},
		});

		expect(result.config.telegram).toEqual({
			allowedChatIds: [123456789, -1001234567890],
			botTokenConfigured: true,
		});
		// The raw token must NOT appear in the DTO
		expect('botToken' in result.config.telegram).toBe(false);

		// Verify the written config has the raw token and chat IDs
		const written = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
		expect(written.channels).toEqual({
			telegram: {
				allowedChatIds: [123456789, -1001234567890],
				botToken: '123456:ABC-DEF',
			},
		});

		// Update only chat IDs (token preserved)
		const updatedChatIds = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
			telegram: {
				allowedChatIds: [999999],
			},
		});
		expect(updatedChatIds.config.telegram).toEqual({
			allowedChatIds: [999999],
			botTokenConfigured: true,
		});

		const writtenUpdated = JSON.parse(await readFile(configPath, 'utf8')) as Record<
			string,
			unknown
		>;
		expect((writtenUpdated.channels as Record<string, unknown>).telegram).toEqual({
			allowedChatIds: [999999],
			botToken: '123456:ABC-DEF',
		});

		// Clear the token (should clear the whole telegram block when chat IDs are also empty)
		const clearedToken = await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'low',
			telegram: {
				allowedChatIds: [],
				botToken: null,
			},
		});
		expect(clearedToken.config.telegram).toEqual({
			allowedChatIds: [],
			botTokenConfigured: false,
		});

		const writtenCleared = JSON.parse(await readFile(configPath, 'utf8')) as Record<
			string,
			unknown
		>;
		// Both token and chat IDs empty → telegram block removed
		expect((writtenCleared.channels as Record<string, unknown>)?.telegram).toBeUndefined();

		// Verify saving telegram settings preserves unrelated config fields
		await service.updateConfig({
			applicationRoots: [workspace],
			cli: 'native',
			ignoredFolders: ['node_modules'],
			reasoningEffort: 'medium',
			telegram: {
				allowedChatIds: [111],
				botToken: 'new-token',
			},
		});
		const afterPreserve = JSON.parse(await readFile(configPath, 'utf8')) as Record<
			string,
			unknown
		>;
		expect((afterPreserve.channels as Record<string, unknown>).telegram).toEqual({
			allowedChatIds: [111],
			botToken: 'new-token',
		});
		expect(afterPreserve.reasoningEffort).toBe('medium');

		await rm(workspace, { force: true, recursive: true });
	});
});
