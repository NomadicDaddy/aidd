import type { ResolvedConfig } from 'aidd-shared/config';

import { describe, expect, test } from 'bun:test';
import { resolveEffectiveLaunchTarget } from 'aidd-shared/plan/launch-target';
import { resolveRunRuntimeMetadata } from 'aidd-shared/plan/runtime-metadata';
import { parseArgs } from 'aidd-shared/args/index';

const emptyEnv = {} as NodeJS.ProcessEnv;

const baseConfig: ResolvedConfig = {
	cli: 'claude-code',
	reasoningEffort: 'medium',
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: null,
	timeoutSeconds: 3600,
	preflightDoctor: false,
	idleTimeoutSeconds: 900,
	idleNudgeTimeoutSeconds: 600,
	dirtyTreeThreshold: 50,
	noWorkBackoffMs: 30_000,
	noClean: false,
	quitOnAbort: 0,
	rateLimitBufferSeconds: 60,
	rateLimitBackoffSeconds: 300,
};

describe('resolveEffectiveLaunchTarget', () => {
	test('falls back to config backend and marks provenance', () => {
		const target = resolveEffectiveLaunchTarget(baseConfig, 'coding', {}, emptyEnv);
		expect(target.backend).toBe('claude-code');
		expect(target.backendSource).toBe('config');
		expect(target.model).toBeUndefined();
		expect(target.modelSource).toBe('unset');
		expect(target.reasoningEffort).toBe('medium');
	});

	test('override backend and model win over every config layer', () => {
		const config: ResolvedConfig = {
			...baseConfig,
			auditModel: 'audit-model',
			codeModel: 'code-model',
			sharedModel: 'shared-model',
			backends: { codex: { model: 'codex-model' } },
		};
		const target = resolveEffectiveLaunchTarget(
			config,
			'audit',
			{ backend: 'codex', model: 'override-model', reasoningEffort: 'high' },
			emptyEnv
		);
		expect(target.backend).toBe('codex');
		expect(target.backendSource).toBe('override');
		expect(target.model).toBe('override-model');
		expect(target.modelSource).toBe('override');
		expect(target.reasoningEffort).toBe('high');
	});

	test('mode model beats backend-scoped and shared models', () => {
		const config: ResolvedConfig = {
			...baseConfig,
			auditModel: 'audit-model',
			codeModel: 'code-model',
			sharedModel: 'shared-model',
			backends: { 'claude-code': { model: 'backend-model' } },
		};
		expect(resolveEffectiveLaunchTarget(config, 'audit', {}, emptyEnv)).toMatchObject({
			model: 'audit-model',
			modelSource: 'mode-config',
		});
		for (const mode of ['coding', 'todo', 'validate', 'directive'] as const) {
			expect(resolveEffectiveLaunchTarget(config, mode, {}, emptyEnv)).toMatchObject({
				model: 'code-model',
				modelSource: 'mode-config',
			});
		}
		// Modes without a mode-scoped model fall through to the backend-scoped model.
		expect(resolveEffectiveLaunchTarget(config, 'interview', {}, emptyEnv)).toMatchObject({
			model: 'backend-model',
			modelSource: 'backend-config',
		});
	});

	test('backend-scoped model applies to the effective backend, not config.cli', () => {
		const config: ResolvedConfig = {
			...baseConfig,
			sharedModel: 'shared-model',
			backends: {
				'claude-code': { model: 'claude-model' },
				codex: { model: 'codex-model' },
			},
		};
		expect(
			resolveEffectiveLaunchTarget(config, 'coding', { backend: 'codex' }, emptyEnv)
		).toMatchObject({ model: 'codex-model', modelSource: 'backend-config' });
		// An override backend without its own scoped model falls to the shared model.
		expect(
			resolveEffectiveLaunchTarget(config, 'coding', { backend: 'opencode' }, emptyEnv)
		).toMatchObject({ model: 'shared-model', modelSource: 'shared-config' });
	});

	test('mode-scoped model does not leak across backends to an override backend', () => {
		// Repro from remediation-20260717: config.cli is native with a mode-scoped
		// auditModel ('glm-5.2'); an override backend (claude-code) has its own
		// backend-scoped model. The mode model must NOT outrank the override backend's
		// own model because it was configured for native's provider, not claude-code's.
		const config: ResolvedConfig = {
			...baseConfig,
			cli: 'native',
			auditModel: 'glm-5.2',
			codeModel: 'glm-5.2',
			backends: { 'claude-code': { model: 'claude-opus-5' } },
		};
		// Audit mode with a backend override and no explicit model: backend-scoped model wins.
		expect(
			resolveEffectiveLaunchTarget(config, 'audit', { backend: 'claude-code' }, emptyEnv)
		).toMatchObject({
			model: 'claude-opus-5',
			modelSource: 'backend-config',
		});
		// Same for coding mode.
		expect(
			resolveEffectiveLaunchTarget(config, 'coding', { backend: 'claude-code' }, emptyEnv)
		).toMatchObject({
			model: 'claude-opus-5',
			modelSource: 'backend-config',
		});
		// An explicit --model override still wins over every config layer.
		expect(
			resolveEffectiveLaunchTarget(
				config,
				'audit',
				{ backend: 'claude-code', model: 'explicit-model' },
				emptyEnv
			)
		).toMatchObject({ model: 'explicit-model', modelSource: 'override' });
		// Default behavior unchanged: native-backend audit run resolves auditModel.
		expect(resolveEffectiveLaunchTarget(config, 'audit', {}, emptyEnv)).toMatchObject({
			model: 'glm-5.2',
			modelSource: 'mode-config',
		});
		// Override backend with no mode model and no backend model falls to provider default.
		const noBackendModel: ResolvedConfig = {
			...baseConfig,
			cli: 'native',
			auditModel: 'glm-5.2',
		};
		expect(
			resolveEffectiveLaunchTarget(
				noBackendModel,
				'audit',
				{ backend: 'claude-code' },
				emptyEnv
			)
		).toMatchObject({
			backend: 'claude-code',
			model: undefined,
			modelSource: 'unset',
		});
	});

	test('provider default chain covers native/ollama/lmstudio backends', () => {
		const config: ResolvedConfig = { ...baseConfig, cli: 'native' };
		const target = resolveEffectiveLaunchTarget(config, 'coding', {}, emptyEnv);
		expect(target.provider).toBe('zhipu');
		expect(target.modelSource).toBe('provider-default');
		expect(target.model).toBeDefined();

		const withProviderModel: ResolvedConfig = {
			...baseConfig,
			cli: 'native',
			providers: { zhipu: { model: 'provider-model' } },
		};
		expect(
			resolveEffectiveLaunchTarget(withProviderModel, 'coding', {}, emptyEnv)
		).toMatchObject({
			model: 'provider-model',
			modelSource: 'provider-default',
		});

		const env = { NATIVE_MODEL: 'env-model' } as unknown as NodeJS.ProcessEnv;
		expect(resolveEffectiveLaunchTarget(withProviderModel, 'coding', {}, env)).toMatchObject({
			model: 'env-model',
		});

		expect(
			resolveEffectiveLaunchTarget(baseConfig, 'coding', { backend: 'lmstudio' }, emptyEnv)
				.provider
		).toBe('lmstudio');
	});

	test('provider-scoped reasoning effort wins over top-level for provider backends', () => {
		const config: ResolvedConfig = {
			...baseConfig,
			cli: 'native',
			providers: { zhipu: { reasoningEffort: 'high' } },
		};
		expect(resolveEffectiveLaunchTarget(config, 'coding', {}, emptyEnv).reasoningEffort).toBe(
			'high'
		);
		// Non-provider backends have no provider scope: top-level effort applies.
		expect(
			resolveEffectiveLaunchTarget(config, 'coding', { backend: 'claude-code' }, emptyEnv)
				.reasoningEffort
		).toBe('medium');
	});

	test('resolveRunRuntimeMetadata delegates without behavior drift', () => {
		const config: ResolvedConfig = {
			...baseConfig,
			auditModel: 'audit-model',
			codeModel: 'code-model',
			sharedModel: 'shared-model',
		};
		const args = parseArgs(['--project-dir', 'd:/applications/demo']);
		const viaMetadata = resolveRunRuntimeMetadata(args, config, 'audit', emptyEnv);
		const viaTarget = resolveEffectiveLaunchTarget(config, 'audit', {}, emptyEnv);
		expect(viaMetadata.model).toBe(viaTarget.model as string);
		expect(viaMetadata.reasoningEffort).toBe(viaTarget.reasoningEffort);

		const withFlag = parseArgs([
			'--project-dir',
			'd:/applications/demo',
			'--model',
			'flag-model',
		]);
		expect(resolveRunRuntimeMetadata(withFlag, config, 'audit', emptyEnv).model).toBe(
			'flag-model'
		);
	});
});
