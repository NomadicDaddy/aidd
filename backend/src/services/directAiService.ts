import type { PersistedReasoningEffortValue } from 'aidd-shared/args/constants';
import type { DirectAiSurface, ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';

import {
	OpenAICompatibleAgentClient,
	type OpenAICompatibleClientConfig,
} from 'aidd-shared/agent/client';
import {
	DirectAiConfigError,
	isDirectAiSurfaceEnabled,
	resolveDirectAiCall,
	type DirectAiResolution,
} from 'aidd-shared/agent/directAi';

import { extractJsonObject } from './directAiUtils.ts';
import { HttpError } from './errors.ts';

type WebRuntimeConfig = ResolvedConfig & { web: ResolvedWebConfig };

export interface DirectAiCompleteRequest {
	cwd: string;
	model?: string | undefined;
	prompt: string;
	reasoningEffort?: PersistedReasoningEffortValue | undefined;
	surface: DirectAiSurface;
	timeoutSeconds?: number | undefined;
}

export interface DirectAiSurfaceMeta {
	model: string;
	provider: string;
	reasoningEffort: PersistedReasoningEffortValue;
}
export interface DirectAiRunner {
	completeJson<T>(request: DirectAiCompleteRequest): Promise<null | T>;
	completeText(request: DirectAiCompleteRequest): Promise<null | string>;
	isSurfaceEnabled(surface: DirectAiSurface): boolean;
	/**
	 * Resolve an OpenAI-compatible client config for a tool-calling surface without throwing.
	 * Returns null when the surface is disabled or no provider can be resolved, so callers can
	 * fall back to a non-agentic path instead of failing.
	 */
	resolveClientConfig(
		surface: DirectAiSurface,
		model?: string
	): null | OpenAICompatibleClientConfig;
	/** Resolve the provider, model, and reasoning effort for a surface without making a call. */
	resolveSurfaceMeta(
		surface: DirectAiSurface,
		model?: string,
		reasoningEffort?: PersistedReasoningEffortValue
	): DirectAiSurfaceMeta | null;
	updateConfig(config: WebRuntimeConfig): void;
}

export const disabledDirectAiRunner: DirectAiRunner = {
	async completeJson() {
		return null;
	},
	async completeText() {
		return null;
	},
	isSurfaceEnabled() {
		return false;
	},
	resolveClientConfig(): null {
		return null;
	},
	resolveSurfaceMeta(): null {
		return null;
	},
	updateConfig() {},
};

export class DirectAiService implements DirectAiRunner {
	private config: WebRuntimeConfig;

	constructor(config: WebRuntimeConfig) {
		this.config = config;
	}

	updateConfig(config: WebRuntimeConfig): void {
		this.config = config;
	}

	isSurfaceEnabled(surface: DirectAiSurface): boolean {
		return isDirectAiSurfaceEnabled(this.config.directAi, surface);
	}

	resolveClientConfig(
		surface: DirectAiSurface,
		model?: string
	): null | OpenAICompatibleClientConfig {
		if (!this.isSurfaceEnabled(surface)) return null;
		try {
			return this.resolveProvider({
				cwd: '',
				prompt: '',
				surface,
				...(model ? { model } : {}),
			}).config;
		} catch {
			// A misconfigured provider (missing baseUrl/model/key) means there is no usable
			// tool-calling client. Returning null lets the caller fall back; the detailed error
			// still surfaces through completeText on the non-agentic path.
			return null;
		}
	}

	resolveSurfaceMeta(
		surface: DirectAiSurface,
		model?: string,
		requestedReasoningEffort?: PersistedReasoningEffortValue
	): DirectAiSurfaceMeta | null {
		if (!this.isSurfaceEnabled(surface)) return null;
		try {
			const resolution = this.resolveProvider({
				cwd: '',
				prompt: '',
				surface,
				...(model ? { model } : {}),
				...(requestedReasoningEffort ? { reasoningEffort: requestedReasoningEffort } : {}),
			});
			const {
				config: { model: resolvedModel, provider },
				reasoningEffort,
			} = resolution;
			return { model: resolvedModel, provider, reasoningEffort };
		} catch {
			return null;
		}
	}

	async completeText(request: DirectAiCompleteRequest): Promise<null | string> {
		if (!this.isSurfaceEnabled(request.surface)) return null;
		const resolved = this.resolveProvider(request);
		const client = new OpenAICompatibleAgentClient(resolved.config);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), resolved.timeoutSeconds * 1000);
		try {
			const response = await client.complete(
				{
					cwd: request.cwd,
					prompt: request.prompt,
					...(request.model ? { model: request.model } : {}),
					reasoningEffort: resolved.reasoningEffort,
				},
				controller.signal
			);
			return response.text.trim();
		} catch (err) {
			if (controller.signal.aborted) {
				throw new HttpError(
					`Direct AI ${request.surface} request timed out after ${resolved.timeoutSeconds} seconds`,
					504
				);
			}
			throw err;
		} finally {
			clearTimeout(timeout);
		}
	}

	async completeJson<T>(request: DirectAiCompleteRequest): Promise<null | T> {
		const text = await this.completeText(request);
		if (text === null) return null;
		const parsed = extractJsonObject(text);
		if (parsed === null) {
			throw new HttpError(`Direct AI ${request.surface} response was not valid JSON`, 502);
		}
		return parsed as T;
	}

	private resolveProvider(request: DirectAiCompleteRequest): DirectAiResolution {
		try {
			return resolveDirectAiCall(this.config, {
				model: request.model,
				reasoningEffort: request.reasoningEffort,
				surface: request.surface,
				timeoutSeconds: request.timeoutSeconds,
			});
		} catch (err) {
			if (err instanceof DirectAiConfigError) {
				throw new HttpError(err.message, 400);
			}
			throw err;
		}
	}
}

export { resolveDirectAiReasoningEffort } from './directAiUtils.ts';
