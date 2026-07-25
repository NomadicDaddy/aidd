import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';

import type { AiCallSurface } from '../../lib/aiCallLog.ts';

import { metadataPath } from '../../metadata/paths.ts';
import { OpenAICompatibleAgentClient } from './openai.ts';
import { SimulationAgentClient } from './simulation.ts';
import {
	type AgentClient,
	type NativeFileConfig,
	type OpenAICompatibleClientConfig,
	providerDefaults,
	type ProviderName,
	type ResolvedNativeClientConfig,
} from './types.ts';

export async function loadNativeFileConfig(): Promise<NativeFileConfig> {
	const configPath = metadataPath(homedir(), 'config.json');
	let raw: string;
	try {
		raw = await readFile(configPath, 'utf8');
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as { code: unknown }).code === 'ENOENT'
		) {
			return {};
		}
		throw error;
	}
	try {
		return JSON.parse(raw) as NativeFileConfig;
	} catch (error) {
		throw new Error(
			`Failed to parse native config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
}

function normalizeProvider(provider: string | undefined): ProviderName {
	if (provider === 'ollama') return 'ollama';
	if (provider === 'lmstudio') return 'lmstudio';
	if (provider === 'openai') return 'openai';
	if (provider === 'xai') return 'xai';
	return 'zhipu';
}

/**
 * Build the default native-backend agent client.
 *
 * `env` defaults to `process.env` because the native backend reads a narrow allowlist of
 * provider-credential variables (`NATIVE_API_KEY`, `ZHIPU_API_KEY`, `XAI_API_KEY`, `NATIVE_BASE_URL`,
 * `NATIVE_MODEL`, `NATIVE_PROVIDER`) plus the test/CI toggle `AIDD_NATIVE_SIMULATION`. These
 * are documented exceptions to aidd's JSON-only configuration rule — see the header of
 * `src/subprocess-env.ts` for the full policy. JSON-file fallbacks (`~/.aidd/config.json` via
 * `loadNativeFileConfig`) are preferred for everything else; env reads here exist so operators
 * can supply provider credentials via the shell without writing them to disk.
 */
export async function createDefaultNativeClient(
	env: NodeJS.ProcessEnv = process.env,
	configOverride?: NativeFileConfig,
	providerOverride?: ProviderName,
	callSurface?: AiCallSurface,
): Promise<AgentClient> {
	const resolved = await resolveDefaultNativeClientConfig(env, configOverride, providerOverride);
	if (resolved.kind === 'simulation') {
		return new SimulationAgentClient();
	}
	return new OpenAICompatibleAgentClient({
		...resolved.config,
		callSource: 'aidd',
		...(callSurface ? { callSurface } : {}),
	});
}

export async function resolveDefaultNativeClientConfig(
	env: NodeJS.ProcessEnv = process.env,
	configOverride?: NativeFileConfig,
	providerOverride?: ProviderName,
): Promise<ResolvedNativeClientConfig> {
	if (env.AIDD_NATIVE_SIMULATION === '1') {
		return { kind: 'simulation' };
	}

	const fileConfig = configOverride ?? (await loadNativeFileConfig());
	const provider =
		providerOverride ?? normalizeProvider(env.NATIVE_PROVIDER ?? fileConfig.defaultProvider);
	const defaults = providerDefaults[provider];
	const providerConfig = fileConfig.providers?.[provider] ?? {};
	// OPENAI_API_KEY is folded in only for the openai provider: it is a ubiquitous shell
	// variable, so blending it into the provider-agnostic chain would let an ambient key
	// silently authenticate a zhipu/xai run whose own key is absent.
	const apiKey =
		env.NATIVE_API_KEY ??
		(provider === 'openai' ? env.OPENAI_API_KEY : undefined) ??
		env.ZHIPU_API_KEY ??
		env.XAI_API_KEY ??
		providerConfig.apiKey;
	const baseUrl = env.NATIVE_BASE_URL ?? providerConfig.baseUrl ?? defaults.baseUrl;
	const model = env.NATIVE_MODEL ?? providerConfig.model ?? defaults.model;

	if (defaults.apiKeyRequired && !apiKey) {
		throw new Error(
			`Native ${provider} provider has no API key configured. ` +
				`Set NATIVE_API_KEY (or ${provider === 'zhipu' ? 'ZHIPU_API_KEY' : provider === 'xai' ? 'XAI_API_KEY' : provider === 'openai' ? 'OPENAI_API_KEY' : 'the provider env var'}), ` +
				`add providers.${provider}.apiKey to ~/.aidd/config.json, or set AIDD_NATIVE_SIMULATION=1 to explicitly run the simulation stub.`,
		);
	}

	const clientConfig: OpenAICompatibleClientConfig = {
		baseUrl,
		model,
		provider,
	};
	if (apiKey) {
		clientConfig.apiKey = apiKey;
	}
	// Streaming controls are JSON-config only (providers.<name>.stream / .streamIdleTimeoutMs);
	// they let an operator disable streaming for a non-SSE-compatible endpoint or tune the idle
	// timeout without an env var, per aidd's JSON-only configuration rule.
	if (providerConfig.stream !== undefined) {
		clientConfig.stream = providerConfig.stream;
	}
	if (providerConfig.streamIdleTimeoutMs !== undefined) {
		clientConfig.streamIdleTimeoutMs = providerConfig.streamIdleTimeoutMs;
	}
	return { config: clientConfig, kind: 'openai-compatible' };
}
