import type { ParsedArgs } from '../args/index.ts';
import type { ResolvedConfig } from '../config.ts';
import type { AiddMode, BackendName } from './types.ts';

import { providerDefaults } from '../agent/client.ts';
import {
	providerForBackend,
	providerScopedReasoningEffort,
	resolveEffectiveLaunchTarget,
} from './launch-target.ts';

export interface RunRuntimeMetadata {
	model?: string;
	provider?: string;
	reasoningEffort: string;
}

export function resolveRunRuntimeMetadata(
	args: ParsedArgs,
	config: ResolvedConfig,
	mode: AiddMode,
	env: NodeJS.ProcessEnv = process.env,
): RunRuntimeMetadata {
	const target = resolveEffectiveLaunchTarget(
		config,
		mode,
		{ model: args.model, reasoningEffort: args.reasoningEffort },
		env,
	);
	return {
		...(target.model !== undefined ? { model: target.model } : {}),
		...(target.provider !== undefined ? { provider: target.provider } : {}),
		reasoningEffort: target.reasoningEffort,
	};
}

export function resolveBackendDefaultModel(
	config: ResolvedConfig,
	backend: BackendName,
	env: NodeJS.ProcessEnv = process.env,
): string | undefined {
	const configuredModel = config.backends?.[backend]?.model ?? config.sharedModel;
	if (configuredModel !== undefined) return configuredModel;
	const provider = providerForBackend(backend, config, env);
	if (!provider) return undefined;
	return (
		env.NATIVE_MODEL ?? config.providers?.[provider]?.model ?? providerDefaults[provider].model
	);
}

export function resolveBackendProvider(
	config: ResolvedConfig,
	backend: BackendName,
	env: NodeJS.ProcessEnv = process.env,
): string | undefined {
	return providerForBackend(backend, config, env);
}

export function resolveBackendReasoningEffort(
	config: ResolvedConfig,
	backend: BackendName,
	env: NodeJS.ProcessEnv = process.env,
): string {
	return providerScopedReasoningEffort(backend, config, env) ?? config.reasoningEffort;
}
