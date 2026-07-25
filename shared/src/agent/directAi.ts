import type { PersistedReasoningEffortValue } from '../args/constants.ts';
import type { DirectAiSurface, ResolvedConfig } from '../config/types.ts';

import { type AiCallSurface } from '../lib/aiCallLog.ts';
import { assertSafeAgentBaseUrl } from '../security/ssrfGuard.ts';
import {
	OpenAICompatibleAgentClient,
	type OpenAICompatibleClientConfig,
	providerDefaults,
} from './client.ts';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Transport-agnostic error thrown when the Direct AI config cannot be resolved. */
export class DirectAiConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DirectAiConfigError';
	}
}

/** Error thrown when a Direct AI call exceeds its timeout. */
export class DirectAiTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DirectAiTimeoutError';
	}
}

// ---------------------------------------------------------------------------
// Surface helpers
// ---------------------------------------------------------------------------

/**
 * Map a `DirectAiSurface` (config key) to the corresponding `AiCallSurface`
 * (structured log surface).
 */
export function directAiSurfaceToCallSurface(surface: DirectAiSurface): AiCallSurface {
	switch (surface) {
		case 'directorChat':
			return 'director_chat';
		case 'directorCycle':
			return 'director_cycle';
		case 'projectAdvisor':
			return 'project_recommendation';
		case 'runSummaries':
			return 'run_summary';
	}
}

/**
 * Check whether a given Direct AI surface is enabled in the resolved config.
 */
export function isDirectAiSurfaceEnabled(
	directAi: ResolvedConfig['directAi'],
	surface: DirectAiSurface,
): boolean {
	return directAi?.enabled === true && directAi.surfaces[surface] === true;
}

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

export interface DirectAiResolution {
	config: OpenAICompatibleClientConfig;
	reasoningEffort: PersistedReasoningEffortValue;
	timeoutSeconds: number;
}

export interface DirectAiResolutionRequest {
	/** Override model from the caller (e.g. backend-specific default). */
	model?: string | undefined;
	/** Override reasoning effort from the caller (e.g. Director profile). */
	reasoningEffort?: PersistedReasoningEffortValue | undefined;
	/** The Direct AI surface this call targets. */
	surface: DirectAiSurface;
	/** Override timeout from the caller. */
	timeoutSeconds?: number | undefined;
}

function cleanString(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function knownProviderDefaults(
	provider: string,
): (typeof providerDefaults)[keyof typeof providerDefaults] | undefined {
	if (provider === 'zhipu') return providerDefaults.zhipu;
	if (provider === 'xai') return providerDefaults.xai;
	if (provider === 'openai') return providerDefaults.openai;
	if (provider === 'ollama') return providerDefaults.ollama;
	if (provider === 'lmstudio') return providerDefaults.lmstudio;
	return undefined;
}

/**
 * Resolve an OpenAI-compatible client config from the shared resolved config.
 * This is the same provider resolution chain used by `DirectAiService.resolveProvider`
 * but without importing any backend code. Throws `DirectAiConfigError` when a required
 * field cannot be resolved.
 */
export function resolveDirectAiCall(
	config: ResolvedConfig,
	request: DirectAiResolutionRequest,
): DirectAiResolution {
	const directAi = config.directAi;
	if (!directAi?.enabled) {
		throw new DirectAiConfigError('Direct AI is not enabled.');
	}
	const provider = cleanString(directAi.provider ?? config.defaultProvider) ?? 'zhipu';
	const providerConfig = config.providers?.[provider];
	const defaults = knownProviderDefaults(provider);
	const baseUrl =
		cleanString(directAi.baseUrl) ?? cleanString(providerConfig?.baseUrl) ?? defaults?.baseUrl;
	const configuredModel =
		cleanString(directAi.model) ?? cleanString(providerConfig?.model) ?? defaults?.model;
	const model = cleanString(request.model) ?? configuredModel;
	const apiKey = cleanString(providerConfig?.apiKey);

	if (!baseUrl) {
		throw new DirectAiConfigError(
			`Direct AI provider "${provider}" requires a baseUrl in directAi.baseUrl or providers.${provider}.baseUrl.`,
		);
	}
	// Call-time SSRF guard: validate the resolved baseUrl at resolution time so a baseUrl
	// set directly in config.json (bypassing the settings-write validator) cannot reach the
	// network unvalidated. This runs in addition to the guard in the OpenAI-compatible client.
	assertSafeAgentBaseUrl(baseUrl, `Direct AI provider "${provider}"`);
	if (!defaults && !configuredModel) {
		throw new DirectAiConfigError(
			`Direct AI provider "${provider}" requires a model in directAi.model or providers.${provider}.model.`,
		);
	}
	if (!model) {
		throw new DirectAiConfigError(
			`Direct AI provider "${provider}" requires a model in directAi.model or providers.${provider}.model.`,
		);
	}
	if (defaults?.apiKeyRequired === true && !apiKey) {
		throw new DirectAiConfigError(
			`Direct AI provider "${provider}" requires an API key in providers.${provider}.apiKey.`,
		);
	}

	return {
		config: {
			...(apiKey ? { apiKey } : {}),
			baseUrl,
			callSource: 'direct',
			callSurface: directAiSurfaceToCallSurface(request.surface),
			model,
			provider,
		},
		reasoningEffort: resolveDirectAiReasoningEffort({
			directAiEffort: directAi.reasoningEffort,
			fallbackEffort: config.reasoningEffort,
			providerEffort: providerConfig?.reasoningEffort,
			requestEffort: request.reasoningEffort,
		}),
		timeoutSeconds: request.timeoutSeconds ?? directAi.timeoutSeconds,
	};
}

// ---------------------------------------------------------------------------
// Reasoning effort resolution
// ---------------------------------------------------------------------------

export interface DirectAiReasoningEffortInputs {
	directAiEffort: PersistedReasoningEffortValue | undefined;
	fallbackEffort: PersistedReasoningEffortValue;
	providerEffort: PersistedReasoningEffortValue | undefined;
	requestEffort: PersistedReasoningEffortValue | undefined;
}

export function resolveDirectAiReasoningEffort(
	inputs: DirectAiReasoningEffortInputs,
): PersistedReasoningEffortValue {
	return (
		inputs.requestEffort ??
		inputs.directAiEffort ??
		inputs.providerEffort ??
		inputs.fallbackEffort
	);
}

// ---------------------------------------------------------------------------
// Convenience: complete a text prompt via Direct AI
// ---------------------------------------------------------------------------

export interface DirectAiTextRequest {
	/** Working directory passed to the agent client. */
	cwd: string;
	/** The text prompt to send. */
	prompt: string;
}

/**
 * Execute a single-turn text completion using the resolved Direct AI config.
 * Wraps `OpenAICompatibleAgentClient` with an AbortController-based timeout
 * and throws `DirectAiTimeoutError` when the call exceeds the resolved timeout.
 */
export async function completeDirectAiText(
	resolution: DirectAiResolution,
	request: DirectAiTextRequest,
): Promise<string> {
	const client = new OpenAICompatibleAgentClient(resolution.config);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), resolution.timeoutSeconds * 1000);
	try {
		const response = await client.complete(
			{
				cwd: request.cwd,
				prompt: request.prompt,
				reasoningEffort: resolution.reasoningEffort,
			},
			controller.signal,
		);
		return response.text.trim();
	} catch (err) {
		if (controller.signal.aborted) {
			throw new DirectAiTimeoutError(
				`Direct AI request timed out after ${resolution.timeoutSeconds} seconds`,
			);
		}
		throw err;
	} finally {
		clearTimeout(timeout);
	}
}
