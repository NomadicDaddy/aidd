import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';

import type { AiCallSurface } from '../../lib/aiCallLog.ts';

import { metadataPath } from '../../metadata/paths.ts';
import { OpenAICompatibleAgentClient } from './openai.ts';
import { isProviderName, providerCredentials } from './providerKeys.ts';
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
	return isProviderName(provider) ? provider : 'zhipu';
}

/**
 * Build the default native-backend agent client.
 *
 * `env` defaults to `process.env` because the native backend reads a narrow allowlist of
 * provider-credential variables (`NATIVE_API_KEY`, the provider-scoped keys in
 * `providerKeys.ts` — `ZHIPU_API_KEY`, `XAI_API_KEY`, `OPENAI_API_KEY` — plus `NATIVE_BASE_URL`,
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
	// NATIVE_API_KEY is the deliberate provider-agnostic override and keeps the head of the chain.
	// Everything after it is scoped to this provider: `providerCredentials` yields only the
	// variable this provider accepts, so an ambient key belonging to another provider is not a
	// candidate at all and cannot be transmitted to an endpoint that never issued it.
	const credential = providerCredentials(env)[provider];
	const apiKey = env.NATIVE_API_KEY ?? credential?.value ?? providerConfig.apiKey;
	const baseUrl = env.NATIVE_BASE_URL ?? providerConfig.baseUrl ?? defaults.baseUrl;
	const model = env.NATIVE_MODEL ?? providerConfig.model ?? defaults.model;

	if (defaults.apiKeyRequired && !apiKey) {
		// The variable named here is the one the resolver just read, taken from the same table, so
		// the message cannot come to advertise a variable that would not in fact be accepted.
		throw new Error(
			`Native ${provider} provider has no API key configured. ` +
				`Set NATIVE_API_KEY${credential ? ` (or ${credential.envVar})` : ''}, ` +
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
