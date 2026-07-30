import type { ResolvedConfig } from 'aidd-shared/config';

import { describe, expect, test } from 'bun:test';
import { resolveEffectiveLaunchTarget } from 'aidd-shared/plan/launch-target';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebContext } from '../../backend/src/context.ts';

import { createLaunchDefaultsRoutes } from '../../backend/src/routes/launchDefaults.ts';
import { HttpError } from '../../backend/src/services/errors.ts';
import { resolveLaunchConfig } from '../../backend/src/services/run/launchConfig.ts';
import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { Elysia } from 'elysia';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
const baseConfig: ResolvedConfig = {
	cli: 'claude-code',
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
	reasoningEffort: 'medium',
	sharedReasoningEffort: 'medium',
	sharedModel: 'shared-model',
	model: 'shared-model',
	timeoutSeconds: 3600,
	preflightDoctor: false,
	auditModel: 'audit-model',
	triumvirate: {
		overseerCli: 'claude-code',
		overseerModel: 'overseer-model',
		secondaryCli: 'codex',
	},
};

async function makeProjectWithConfig(
	config: object,
): Promise<{ projectDir: string; root: string }> {
	const root = await testTempDir('aidd-launch-defaults-');
	const projectDir = join(root, 'proj');
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await Bun.write(join(projectDir, '.aidd', 'aidd.config.json'), JSON.stringify(config));
	return { projectDir, root };
}

function makeApp(config: ResolvedConfig, resolveProjectPath?: (path: string) => Promise<string>) {
	const context = {
		config,
		projectService: {
			resolveProjectPath:
				resolveProjectPath ?? (async (path: string): Promise<string> => path),
		},
	} as unknown as WebContext;
	return new Elysia().use(errorHandlerPlugin).use(createLaunchDefaultsRoutes(context));
}

interface LaunchDefaultsBody {
	effective: Record<string, unknown>;
	projectConfigApplied: boolean;
	triumvirate: Record<string, { backend: null | string; model: null | string }>;
}

async function getDefaults(app: ReturnType<typeof makeApp>, query = '') {
	const response = await app.handle(
		new Request(`http://localhost/api/v1/launch-defaults${query}`),
	);
	return { body: (await response.json()) as LaunchDefaultsBody, status: response.status };
}

describe('resolveLaunchConfig', () => {
	test('returns the base config untouched without a project dir or project config', async () => {
		expect(await resolveLaunchConfig({ base: baseConfig, projectDir: null })).toEqual({
			config: baseConfig,
			projectConfigApplied: false,
		});
		const root = await testTempDir('aidd-launch-config-');
		try {
			const projectDir = join(root, 'proj');
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			const result = await resolveLaunchConfig({ base: baseConfig, projectDir });
			expect(result.projectConfigApplied).toBe(false);
			expect(result.config).toEqual(baseConfig);
		} finally {
			await removeTempTree(root);
		}
	});

	test('overlays project cli/model/backends and recomputes the folded model', async () => {
		const { projectDir, root } = await makeProjectWithConfig({
			backends: { codex: { model: 'project-codex-model' } },
			cli: 'codex',
			model: 'project-shared-model',
		});
		try {
			const { config, projectConfigApplied } = await resolveLaunchConfig({
				base: baseConfig,
				projectDir,
			});
			expect(projectConfigApplied).toBe(true);
			expect(config.cli).toBe('codex');
			expect(config.sharedModel).toBe('project-shared-model');
			expect(config.model).toBe('project-codex-model');
			// Base config is not mutated.
			expect(baseConfig.cli).toBe('claude-code');
		} finally {
			await removeTempTree(root);
		}
	});

	test('overlays project reasoningEffort so launch-target resolution honors it', async () => {
		const { projectDir, root } = await makeProjectWithConfig({ reasoningEffort: 'xhigh' });
		try {
			const { config } = await resolveLaunchConfig({ base: baseConfig, projectDir });
			expect(config.reasoningEffort).toBe('xhigh');
			// sharedReasoningEffort outranks config.reasoningEffort in the launch-target chain, so
			// leaving it at the base value would silently discard the project's setting.
			expect(config.sharedReasoningEffort).toBe('xhigh');
			expect(resolveEffectiveLaunchTarget(config, 'coding', {}, {}).reasoningEffort).toBe(
				'xhigh',
			);
			expect(baseConfig.sharedReasoningEffort).toBe('medium');
		} finally {
			await removeTempTree(root);
		}
	});

	test('merges triumvirate per key and keeps base fields the project omits', async () => {
		const { projectDir, root } = await makeProjectWithConfig({
			triumvirate: { secondaryCli: 'opencode' },
		});
		try {
			const { config } = await resolveLaunchConfig({ base: baseConfig, projectDir });
			expect(config.triumvirate).toEqual({
				overseerCli: 'claude-code',
				overseerModel: 'overseer-model',
				secondaryCli: 'opencode',
			});
			expect(config.auditModel).toBe('audit-model');
		} finally {
			await removeTempTree(root);
		}
	});
});

describe('GET /api/v1/launch-defaults', () => {
	test('returns global effective defaults and triumvirate role defaults', async () => {
		const { body, status } = await getDefaults(makeApp(baseConfig));
		expect(status).toBe(200);
		expect(body.effective).toMatchObject({
			backend: 'claude-code',
			backendSource: 'config',
			model: 'shared-model',
			reasoningEffort: 'medium',
		});
		expect(body.projectConfigApplied).toBe(false);
		expect(body.triumvirate).toEqual({
			exec: { backend: null, model: null },
			overseer: { backend: 'claude-code', model: 'overseer-model' },
			secondary: { backend: 'codex', model: null },
		});
	});

	test('mode=audit resolves the audit model', async () => {
		const { body } = await getDefaults(makeApp(baseConfig), '?mode=audit');
		expect(body.effective).toMatchObject({ model: 'audit-model', modelSource: 'mode-config' });
	});

	test('applies the project config overlay for projectDir queries', async () => {
		const { projectDir, root } = await makeProjectWithConfig({
			cli: 'codex',
			model: 'project-model',
		});
		try {
			const { body } = await getDefaults(
				makeApp(baseConfig),
				`?projectDir=${encodeURIComponent(projectDir)}`,
			);
			expect(body.projectConfigApplied).toBe(true);
			expect(body.effective).toMatchObject({ backend: 'codex', model: 'project-model' });
		} finally {
			await removeTempTree(root);
		}
	});

	test('rejects project dirs outside allowed roots', async () => {
		const app = makeApp(baseConfig, async () => {
			throw new HttpError('Project path is outside the allowed roots', 400);
		});
		const { status } = await getDefaults(app, '?projectDir=d:/outside');
		expect(status).toBe(400);
	});
});
