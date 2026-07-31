import { describe, expect, test } from 'bun:test';
import { parseArgs } from 'aidd-shared/args/index';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { resolveRunRuntimeMetadata } from 'aidd-shared/plan/runtime-metadata';
import type { ResolvedConfig } from 'aidd-shared/config';

const config: ResolvedConfig = {
	cli: 'native',
	reasoningEffort: 'low',
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

describe('resolveRunPlan', () => {
	test('resolves default coding run', () => {
		const plan = resolveRunPlan(parseArgs(['--project-dir', 'd:/applications/demo']), config);
		expect(plan.mode).toBe('coding');
		expect(plan.backend).toBe('native');
		expect(plan.scope.maxIterations).toBeNull();
		expect(plan.initGitAfterScaffold).toBe(false);
		expect(plan.stopBeforeImplementation).toBe(false);
		expect(plan.reasoningEffort).toBe('low');
	});

	test('carries the blueprint implementation boundary into the run plan', () => {
		const plan = resolveRunPlan(
			parseArgs(['--project-dir', 'd:/applications/demo', '--stop-before-implementation']),
			config,
		);

		expect(plan.stopBeforeImplementation).toBe(true);
	});

	test('routes in-process backends (native/ollama/lmstudio/openai) to the native prompt fragment', () => {
		for (const cli of ['native', 'ollama', 'lmstudio', 'openai'] as const) {
			const plan = resolveRunPlan(
				parseArgs(['--project-dir', 'd:/applications/demo', '--cli', cli]),
				{
					...config,
					cli,
				},
			);
			expect(plan.backend).toBe(cli);
			const backendFragment = plan.prompt.fragments.find(
				(fragment) => fragment.kind === 'backend',
			);
			expect(backendFragment?.path).toBe('prompts/_cli/native.md');
		}
	});

	test('carries internal fresh-project Git init flag into the run plan', () => {
		const plan = resolveRunPlan(
			parseArgs(['--project-dir', 'd:/applications/demo', '--init-git-after-scaffold']),
			config,
		);

		expect(plan.initGitAfterScaffold).toBe(true);
	});

	test('honors provider-scoped reasoningEffort for native backend and falls back to top-level otherwise', () => {
		const nativeWithProviderEffort: ResolvedConfig = {
			...config,
			defaultProvider: 'zhipu',
			providers: { zhipu: { reasoningEffort: 'high' } },
		};
		const nativePlan = resolveRunPlan(
			parseArgs(['--project-dir', 'd:/applications/demo']),
			nativeWithProviderEffort,
		);
		expect(nativePlan.reasoningEffort).toBe('high');

		const claudePlan = resolveRunPlan(parseArgs(['--project-dir', 'd:/applications/demo']), {
			...nativeWithProviderEffort,
			cli: 'claude-code',
		});
		expect(claudePlan.reasoningEffort).toBe('low');

		const explicitArgsWin = resolveRunPlan(
			parseArgs(['--project-dir', 'd:/applications/demo', '--reasoning-effort', 'minimal']),
			nativeWithProviderEffort,
		);
		expect(explicitArgsWin.reasoningEffort).toBe('minimal');
	});

	test('resolves provider, model, and reasoning metadata for ledger capture', () => {
		const runtime = resolveRunRuntimeMetadata(
			parseArgs(['--project-dir', 'd:/applications/demo']),
			{
				...config,
				defaultProvider: 'zhipu',
				providers: {
					zhipu: {
						model: 'provider-model',
						reasoningEffort: 'high',
					},
				},
			},
			'coding',
			{},
		);

		expect(runtime).toEqual({
			model: 'provider-model',
			provider: 'zhipu',
			reasoningEffort: 'high',
		});
	});

	test('keeps benchmark-only reasoning and thinking overrides in the run plan', () => {
		const plan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				'd:/applications/demo',
				'--reasoning-effort',
				'max',
				'--thinking-level',
				'high',
			]),
			config,
		);

		expect(plan.reasoningEffort).toBe('max');
		expect(plan.thinkingLevel).toBe('high');
	});

	test('makes director requirements explicit', () => {
		const plan = resolveRunPlan(
			parseArgs([
				'--director',
				'--fleet-summary',
				'fleet.json',
				'--director-output',
				'out.json',
			]),
			config,
		);
		expect(plan.mode).toBe('director');
		expect(plan.director?.fleetSummaryPath.endsWith('fleet.json')).toBe(true);
	});

	test('resolves optional director context path', () => {
		const plan = resolveRunPlan(
			parseArgs([
				'--director',
				'--fleet-summary',
				'fleet.json',
				'--director-output',
				'out.json',
				'--director-context',
				'context.json',
			]),
			config,
		);
		expect(plan.director?.contextPath?.endsWith('context.json')).toBe(true);
		expect(plan.prompt.variables.directorContextPath).toBe('context.json');
	});

	test('documents mode priority', () => {
		const plan = resolveRunPlan(
			parseArgs(['--project-dir', '.', '--audit', 'SECURITY', '--todo', '--validate']),
			config,
		);
		expect(plan.mode).toBe('audit');
	});

	test('selects mode-specific configured models', () => {
		const modelConfig: ResolvedConfig = {
			...config,
			model: 'default-model',
			codeModel: 'code-model',
			auditModel: 'audit-model',
		};

		expect(
			resolveRunPlan(parseArgs(['--project-dir', '.', '--cli', 'native']), modelConfig).model,
		).toBe('code-model');
		expect(
			resolveRunPlan(parseArgs(['--project-dir', '.', '--audit', 'SECURITY']), modelConfig)
				.model,
		).toBe('audit-model');
		expect(
			resolveRunPlan(
				parseArgs(['--director', '--fleet-summary', 'f', '--director-output', 'o']),
				modelConfig,
			).model,
		).toBe('default-model');
	});

	test('resolves triumvirate role plan from CLI flags', () => {
		const plan = resolveRunPlan(
			parseArgs([
				'--project-dir',
				'.',
				'--cli',
				'codex',
				'--model',
				'primary-model',
				'--triumvirate',
				'--secondary-cli',
				'claude-code',
				'--secondary-model',
				'secondary-model',
				'--overseer-cli',
				'opencode',
				'--overseer-model',
				'overseer-model',
				'--exec-cli',
				'native',
				'--exec-model',
				'exec-model',
			]),
			{ ...config, cli: 'codex' },
		);

		expect(plan.mode).toBe('coding');
		expect(plan.triumvirate).toEqual({
			primary: { backend: 'codex', model: 'primary-model' },
			secondary: { backend: 'claude-code', model: 'secondary-model' },
			overseer: { backend: 'opencode', model: 'overseer-model' },
			execution: { backend: 'native', model: 'exec-model' },
		});
	});

	test('resolves triumvirate defaults from config and requires planning role CLIs', () => {
		expect(() =>
			resolveRunPlan(parseArgs(['--project-dir', '.', '--triumvirate']), config),
		).toThrow(/requires --secondary-cli/);
		expect(() =>
			resolveRunPlan(
				parseArgs(['--project-dir', '.', '--triumvirate', '--secondary-cli', 'codex']),
				config,
			),
		).toThrow(/requires --secondary-cli/);
		expect(() =>
			resolveRunPlan(
				parseArgs(['--project-dir', '.', '--triumvirate', '--overseer-cli', 'opencode']),
				config,
			),
		).toThrow(/requires --secondary-cli/);

		const plan = resolveRunPlan(parseArgs(['--project-dir', '.', '--triumvirate']), {
			...config,
			triumvirate: {
				overseerCli: 'opencode',
				overseerModel: 'overseer-model',
				secondaryCli: 'codex',
			},
		});

		expect(plan.triumvirate?.secondary.backend).toBe('codex');
		expect(plan.triumvirate?.overseer).toEqual({
			backend: 'opencode',
			model: 'overseer-model',
		});
		expect(plan.triumvirate?.execution).toEqual({
			backend: 'opencode',
			model: 'overseer-model',
		});
	});

	test('explicit triumvirate execution role overrides overseer fallback', () => {
		const plan = resolveRunPlan(parseArgs(['--project-dir', '.', '--triumvirate']), {
			...config,
			triumvirate: {
				execCli: 'native',
				execModel: 'exec-model',
				overseerCli: 'opencode',
				overseerModel: 'overseer-model',
				secondaryCli: 'codex',
			},
		});

		expect(plan.triumvirate?.secondary.backend).toBe('codex');
		expect(plan.triumvirate?.overseer.backend).toBe('opencode');
		expect(plan.triumvirate?.execution).toEqual({
			backend: 'native',
			model: 'exec-model',
		});
	});
});
