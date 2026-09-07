import type { ResolvedConfig } from '../config.ts';
import type { AiddMode, BackendName } from './types.ts';

import { providerDefaults } from '../agent/client.ts';

export interface LaunchTargetOverrides {
	backend?: BackendName | undefined;
	model?: string | undefined;
	reasoningEffort?: string | undefined;
}

export type LaunchBackendSource = 'config' | 'override';

export type LaunchModelSource =
	'backend-config' | 'mode-config' | 'override' | 'provider-default' | 'shared-config' | 'unset';

export interface EffectiveLaunchTarget {
	backend: BackendName;
	backendSource: LaunchBackendSource;
	model: string | undefined;
	modelSource: LaunchModelSource;
	provider: string | undefined;
	reasoningEffort: string;
}

function normalizeNativeProvider(provider: string | undefined): keyof typeof providerDefaults {
	if (provider === 'ollama') return 'ollama';
	if (provider === 'lmstudio') return 'lmstudio';
	if (provider === 'openai') return 'openai';
	if (provider === 'xai') return 'xai';
	return 'zhipu';
}

export function providerForBackend(
	backend: BackendName,
	config: ResolvedConfig,
	env: NodeJS.ProcessEnv,
): keyof typeof providerDefaults | undefined {
	if (backend === 'ollama') return 'ollama';
	if (backend === 'lmstudio') return 'lmstudio';
	if (backend === 'openai') return 'openai';
	if (backend === 'native') {
		return normalizeNativeProvider(env.NATIVE_PROVIDER ?? config.defaultProvider);
	}
	return undefined;
}

export function providerScopedReasoningEffort(
	backend: BackendName,
	config: ResolvedConfig,
	env: NodeJS.ProcessEnv,
): string | undefined {
	const effectiveProvider = providerForBackend(backend, config, env);
	if (!effectiveProvider) return undefined;
	return config.providers?.[effectiveProvider]?.reasoningEffort;
}

function modeScopedModel(config: ResolvedConfig, mode: AiddMode): string | undefined {
	if (mode === 'audit') return config.auditModel;
	if (mode === 'coding' || mode === 'todo' || mode === 'validate' || mode === 'directive') {
		return config.codeModel;
	}
	return undefined;
}

/**
 * The single source of truth for "which backend/model/effort will this run use".
 * Precedence mirrors the CLI plan semantics (`resolveRunRuntimeMetadata` delegates here):
 * override → mode model (auditModel/codeModel, only when effective backend == config.cli) →
 * backend-scoped model → shared model → provider default. Reasoning follows per-launch →
 * backend-scoped → provider-scoped → shared. Both the CLI plan and the web launch path resolve
 * through this function so the two can never drift.
 */
export function resolveEffectiveLaunchTarget(
	config: ResolvedConfig,
	mode: AiddMode,
	overrides: LaunchTargetOverrides = {},
	env: NodeJS.ProcessEnv = process.env,
): EffectiveLaunchTarget {
	const backend = overrides.backend ?? config.cli;
	const backendSource: LaunchBackendSource =
		overrides.backend !== undefined ? 'override' : 'config';
	const provider = providerForBackend(backend, config, env);

	let model: string | undefined;
	let modelSource: LaunchModelSource = 'unset';
	// Mode-scoped models (auditModel/codeModel) are configured for config.cli's provider,
	// so they are only valid when the effective backend IS config.cli — mirroring the
	// sharedFallback cross-backend guard below. Applying them to an override backend
	// would hand a wrong-provider model id to the spawned CLI (e.g. claude-code received
	// glm-5.3 and failed with model_not_found 404).
	const modeModel = backend === config.cli ? modeScopedModel(config, mode) : undefined;
	const backendModel = config.backends?.[backend]?.model;
	// config.model already folds in config.cli's backend-scoped model (and any CLI --model
	// override), so it is only a valid fallback when the effective backend IS config.cli;
	// for an override backend the raw shared model is the correct cross-backend fallback.
	const sharedFallback =
		backend === config.cli ? (config.model ?? config.sharedModel) : config.sharedModel;
	if (overrides.model !== undefined) {
		model = overrides.model;
		modelSource = 'override';
	} else if (modeModel !== undefined) {
		model = modeModel;
		modelSource = 'mode-config';
	} else if (backendModel !== undefined) {
		model = backendModel;
		modelSource = 'backend-config';
	} else if (sharedFallback !== undefined) {
		model = sharedFallback;
		modelSource = 'shared-config';
	} else if (provider !== undefined) {
		model =
			env.NATIVE_MODEL ??
			config.providers?.[provider]?.model ??
			providerDefaults[provider].model;
		if (model !== undefined) modelSource = 'provider-default';
	}

	// sharedReasoningEffort outranks config.reasoningEffort because resolveMergedConfig folds the
	// *resolving* backend's scoped effort into config.reasoningEffort — consulting it first would
	// leak backend A's effort into a launch target computed for backend B. resolveMergedConfig
	// always populates sharedReasoningEffort, so the final fallback only serves configs built
	// another way (e.g. `defaults`).
	const reasoningEffort =
		overrides.reasoningEffort ??
		config.backends?.[backend]?.reasoningEffort ??
		providerScopedReasoningEffort(backend, config, env) ??
		config.sharedReasoningEffort ??
		config.reasoningEffort;

	return {
		backend,
		backendSource,
		model,
		modelSource,
		provider,
		reasoningEffort,
	};
}
