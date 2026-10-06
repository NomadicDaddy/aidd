import type {
	AgentClient,
	AgentLoopRequest,
	AgentLoopResponse,
	FetchLike,
	OpenAICompatibleClientConfig,
	StreamDelta,
} from './types.ts';

import { logAiCallSync } from '../../lib/aiCallLog.ts';
import { scrubSecrets } from '../../lib/secretScrubber.ts';
import { assertSafeAgentBaseUrl } from '../../security/ssrfGuard.ts';
import { readBoundedProviderBody } from './boundedBody.ts';
import { buildChatCompletionBody, shouldStream } from './request.ts';
import { type ChatCompletionResponse, readChatCompletionStream } from './stream.ts';

const MAX_ERROR_BODY_CHARS = 1000;

/**
 * A provider HTTP 429. The message keeps the `HTTP 429` wording the shared rate-limit classifier
 * keys on; `resetAt` is the Retry-After header (delay-seconds or an HTTP-date) as an ISO timestamp
 * when it parses, so the orchestrator can sleep until the reset rather than a fallback interval.
 */
export class ProviderRateLimitError extends Error {
	readonly resetAt: string | undefined;

	constructor(message: string, resetAt: string | undefined) {
		super(message);
		this.name = 'ProviderRateLimitError';
		this.resetAt = resetAt;
	}
}

export function retryAfterIso(header: null | string, now = Date.now()): string | undefined {
	if (header === null) return undefined;
	const value = header.trim();
	if (/^\d+$/.test(value)) return new Date(now + Number(value) * 1000).toISOString();
	const date = Date.parse(value);
	return Number.isNaN(date) ? undefined : new Date(date).toISOString();
}

export class OpenAICompatibleAgentClient implements AgentClient {
	private readonly config: OpenAICompatibleClientConfig;
	private readonly fetchImpl: FetchLike;

	constructor(config: OpenAICompatibleClientConfig) {
		this.config = config;
		this.fetchImpl = config.fetch ?? fetch;
	}

	async complete(
		request: AgentLoopRequest,
		signal: AbortSignal,
		onDelta?: (delta: StreamDelta) => void,
	): Promise<AgentLoopResponse> {
		const startMs = Date.now();
		const model = request.model ?? this.config.model;
		const streaming = shouldStream(this.config);
		let success = false;
		let errorMessage: string | undefined;
		let errorDiag: ErrorDiagnostics = {};
		let inputTokens: number | undefined;
		let outputTokens: number | undefined;
		let finishReason: string | undefined;
		const body = buildChatCompletionBody(this.config, request, streaming);
		const requestJson = JSON.stringify(body);
		const requestBytes = Buffer.byteLength(requestJson, 'utf8');
		const host = safeHost(this.config.baseUrl);
		try {
			// Call-time SSRF guard: validate the resolved baseUrl immediately before fetch so
			// a baseUrl set directly in config.json (bypassing the settings-write validator)
			// cannot reach the network unvalidated.
			assertSafeAgentBaseUrl(this.config.baseUrl, `Provider "${this.config.provider}"`);
			const response = await this.fetchImpl(
				`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`,
				{
					body: requestJson,
					headers: {
						'content-type': 'application/json',
						...(this.config.apiKey
							? { authorization: `Bearer ${this.config.apiKey}` }
							: {}),
					},
					// Do not follow redirects — prevents an open-redirect / SSRF pivot to a
					// private or metadata target after the initial URL passes validation.
					method: 'POST',
					redirect: 'error',
					signal,
				},
			);

			if (!response.ok) {
				const scrubbedBody = scrubSecrets(await readBoundedProviderBody(response));
				const body =
					scrubbedBody.length > MAX_ERROR_BODY_CHARS
						? `${scrubbedBody.slice(0, MAX_ERROR_BODY_CHARS)}…[truncated]`
						: scrubbedBody;
				// A throttle is the one failure the run should wait out rather than fail on, so it
				// is thrown as its own class with the reset time the header named.
				if (response.status === 429) {
					throw new ProviderRateLimitError(
						`${this.config.provider} request failed: HTTP 429${body ? ` ${body}` : ''}`,
						retryAfterIso(response.headers.get('retry-after')),
					);
				}
				// Local servers (Ollama/LM Studio) reject oversized prompts with a bare 400;
				// aidd's audit/remediation prompts run 12–65k tokens, far past common 4–8k
				// defaults, so name the real fix instead of surfacing an opaque HTTP error.
				if (
					response.status === 400 &&
					/context|token|length|too (?:long|large)/i.test(body)
				) {
					throw new Error(
						`${this.config.provider} rejected the request (HTTP 400) — the prompt likely exceeds ` +
							`the model's configured context window. Raise the model's context length ` +
							`(aidd prompts can need 64k+) or reduce prompt size. Server said: ${body}`,
					);
				}
				throw new Error(
					`${this.config.provider} request failed: HTTP ${response.status}${body ? ` ${body}` : ''}`,
				);
			}

			// Streaming keeps bytes flowing during long reasoning turns, so an upstream/socket
			// idle timeout does not silently kill a request that is still making progress. The
			// per-stream idle timeout comes from provider config (JSON), never an env var.
			const responseBody = streaming
				? await readChatCompletionStream(response, this.config.provider, {
						...(this.config.streamIdleTimeoutMs !== undefined
							? { idleTimeoutMs: this.config.streamIdleTimeoutMs }
							: {}),
						...(onDelta !== undefined ? { onDelta } : {}),
					})
				: (JSON.parse(await readBoundedProviderBody(response)) as ChatCompletionResponse);
			const choice = responseBody.choices?.[0];
			const message = choice?.message;
			const content = message?.content;
			if (typeof content !== 'string' && !message?.tool_calls?.length) {
				throw new Error(
					`${this.config.provider} response did not include assistant content`,
				);
			}

			const result: AgentLoopResponse = { text: typeof content === 'string' ? content : '' };
			// Both transports carry the stop reason through unchanged; a `length` or
			// `content_filter` turn is the caller's to refuse, not a transport error.
			if (typeof choice?.finish_reason === 'string' && choice.finish_reason.length > 0) {
				result.finishReason = choice.finish_reason;
				finishReason = choice.finish_reason;
			}
			if (message?.tool_calls?.length) {
				result.toolCalls = message.tool_calls.map((toolCall, index) => ({
					arguments: toolCall.function?.arguments ?? '{}',
					id: toolCall.id ?? `call_${index}`,
					name: toolCall.function?.name ?? '',
				}));
			}
			if (responseBody.usage?.prompt_tokens !== undefined) {
				result.inputTokens = responseBody.usage.prompt_tokens;
				inputTokens = responseBody.usage.prompt_tokens;
			}
			if (responseBody.usage?.completion_tokens !== undefined) {
				result.outputTokens = responseBody.usage.completion_tokens;
				outputTokens = responseBody.usage.completion_tokens;
			}
			// cached_tokens ⊂ prompt_tokens and reasoning_tokens ⊂ completion_tokens (OpenAI
			// usage convention) — captured so the cost estimate applies the cached discount and
			// does not double-count reasoning. Matches the codex parser's normalization.
			const cachedTokens = responseBody.usage?.prompt_tokens_details?.cached_tokens;
			if (cachedTokens !== undefined) result.cachedTokens = cachedTokens;
			const reasoningTokens = responseBody.usage?.completion_tokens_details?.reasoning_tokens;
			if (reasoningTokens !== undefined) result.reasoningTokens = reasoningTokens;
			success = true;
			return result;
		} catch (error) {
			errorMessage = scrubSecrets(error instanceof Error ? error.message : String(error));
			errorDiag = describeError(error);
			throw error;
		} finally {
			logAiCallSync({
				durationMs: Date.now() - startMs,
				model,
				provider: this.config.provider,
				requestBytes,
				source: this.config.callSource ?? 'aidd',
				success,
				surface: this.config.callSurface ?? 'unknown',
				timestamp: new Date(startMs).toISOString(),
				...(host !== undefined ? { host } : {}),
				...(request.turn !== undefined ? { turn: request.turn } : {}),
				...(inputTokens !== undefined ? { inputTokens } : {}),
				...(outputTokens !== undefined ? { outputTokens } : {}),
				...(finishReason !== undefined ? { finishReason } : {}),
				...(errorMessage ? { error: errorMessage } : {}),
				...(errorDiag.name ? { errorName: errorDiag.name } : {}),
				...(errorDiag.code ? { errorCode: errorDiag.code } : {}),
				...(errorDiag.cause ? { errorCause: errorDiag.cause } : {}),
			});
		}
	}
}

interface ErrorDiagnostics {
	cause?: string;
	code?: string;
	name?: string;
}

// Transport failures (e.g. Bun's socket timeout) surface a bare "The operation timed out"
// in error.message while the real diagnosis lives in error.name/.code and the .cause chain.
// Capture all three so a repeat failure is triageable without another repro.
function describeError(error: unknown): ErrorDiagnostics {
	if (!(error instanceof Error)) return {};
	const diag: ErrorDiagnostics = {};
	if (error.name) diag.name = error.name;
	const topCode = readErrorCode(error);
	if (topCode !== undefined) diag.code = topCode;
	const causeChain: string[] = [];
	let cause: unknown = error.cause;
	let depth = 0;
	while (cause !== null && cause !== undefined && depth < 5) {
		causeChain.push(cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));
		if (diag.code === undefined) {
			const causeCode = readErrorCode(cause);
			if (causeCode !== undefined) diag.code = causeCode;
		}
		cause = cause instanceof Error ? cause.cause : undefined;
		depth++;
	}
	if (causeChain.length > 0) diag.cause = scrubSecrets(causeChain.join(' <- '));
	return diag;
}

function readErrorCode(error: unknown): string | undefined {
	const code = (error as { code?: unknown }).code;
	if (typeof code === 'string') return code;
	if (typeof code === 'number') return String(code);
	return undefined;
}

function safeHost(baseUrl: string): string | undefined {
	try {
		return new URL(baseUrl).host;
	} catch {
		return undefined;
	}
}
