import type { StreamDelta } from './types.ts';

import { scrubSecrets } from '../../lib/secretScrubber.ts';

/**
 * Normalized OpenAI-compatible chat-completion response shape. Both the non-streaming JSON path
 * and {@link readChatCompletionStream} produce this, so the client handles them identically.
 */
export interface ChatCompletionResponse {
	choices?: {
		message?: {
			content?: unknown;
			tool_calls?: {
				function?: {
					arguments?: string;
					name?: string;
				};
				id?: string;
			}[];
		};
	}[];
	usage?: {
		completion_tokens?: number;
		completion_tokens_details?: {
			reasoning_tokens?: number;
		};
		prompt_tokens?: number;
		prompt_tokens_details?: {
			cached_tokens?: number;
		};
	};
}

// A stream that goes fully silent (no bytes at all) for this long is treated as stalled and
// failed with a "timed out" message, so the run's retry logic can classify and bound it rather
// than hang until an opaque upstream socket timeout. Generous by default; override via provider
// config (streamIdleTimeoutMs) — NOT an env var, per aidd's JSON-only config rule.
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 180_000;

// Hard ceiling on total accumulated content + tool-argument characters for a single turn. A
// continuously-emitting (buggy or hostile) provider never trips the idle timeout — it keeps
// sending bytes — so without this cap the retained strings grow until the run's wall-clock budget,
// exhausting memory. 24M chars is far past any legitimate single-turn response.
export const DEFAULT_MAX_STREAM_CHARS = 24_000_000;

export interface StreamReadOptions {
	/** Idle (no-bytes) timeout in ms before the stream is treated as stalled. */
	idleTimeoutMs?: number;
	/** Hard cap on accumulated content + tool-arg characters before aborting a runaway stream. */
	maxChars?: number;
	/** Called synchronously per content/reasoning fragment, for live-progress consumers. */
	onDelta?: (delta: StreamDelta) => void;
}

interface StreamedToolCall {
	arguments: string;
	id?: string;
	name?: string;
}

/**
 * Consume an OpenAI-compatible `text/event-stream` chat completion and reassemble it into the
 * same {@link ChatCompletionResponse} shape the non-streaming path produces, so downstream
 * handling is identical. Content deltas concatenate; tool-call deltas are keyed by `index` and
 * their argument fragments concatenated (the first fragment carries `id`/`name`); the final
 * usage-only chunk (from `stream_options.include_usage`) supplies token counts.
 *
 * The stream must end with a terminal signal — `data: [DONE]` or a choice `finish_reason`. An EOF
 * without one is a truncated (dropped) connection and is rejected as a transient error rather than
 * returned as a short "success", so the run retries it instead of committing a half response.
 */
export async function readChatCompletionStream(
	response: Response,
	provider: string,
	options: StreamReadOptions = {}
): Promise<ChatCompletionResponse> {
	if (!response.body) {
		throw new Error(`${provider} returned a streaming response with no body`);
	}
	const idleMs = options.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
	const maxChars = options.maxChars ?? DEFAULT_MAX_STREAM_CHARS;
	// Structural typing sidesteps the Bun-vs-DOM ReadableStream lib mismatch (readMany, etc.).
	const reader = response.body.getReader() as ByteStreamReader;
	const decoder = new TextDecoder();
	const toolCalls = new Map<number, StreamedToolCall>();
	let buffer = '';
	let content = '';
	let sawContent = false;
	let accumulatedChars = 0;
	let usage: ChatCompletionResponse['usage'];
	// A proper terminal signal was seen: `[DONE]` (done) or a choice finish_reason (finished).
	let done = false;
	let finished = false;
	try {
		while (!done) {
			const chunk = await readWithIdleTimeout(reader, idleMs, provider);
			if (chunk.done) break;
			if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true });
			let newlineIndex: number;
			while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
				const line = buffer.slice(0, newlineIndex).trim();
				buffer = buffer.slice(newlineIndex + 1);
				// SSE frames are `data: <json>`; comments (`: ping`) and `event:` lines are ignored.
				if (line === '' || !line.startsWith('data:')) continue;
				const data = line.slice('data:'.length).trim();
				if (data === '[DONE]') {
					done = true;
					break;
				}
				let parsed: StreamChunk;
				try {
					parsed = JSON.parse(data) as StreamChunk;
				} catch {
					// A complete `data:` line that is not valid JSON is a protocol violation, not a
					// partial frame (partials are buffered until their newline). Fail loudly and
					// actionably rather than silently dropping model output.
					throw new Error(
						`${provider} sent a malformed streaming frame — this endpoint may not be ` +
							`OpenAI SSE-compatible; set providers.${provider}.stream = false to disable streaming`
					);
				}
				if (parsed.error !== undefined) {
					throw new Error(
						`${provider} stream error: ${scrubSecrets(JSON.stringify(parsed.error))}`
					);
				}
				if (parsed.usage) usage = parsed.usage;
				const choice = parsed.choices?.[0];
				if (typeof choice?.finish_reason === 'string' && choice.finish_reason.length > 0) {
					finished = true;
				}
				const delta = choice?.delta;
				if (typeof delta?.content === 'string') {
					content += delta.content;
					accumulatedChars += delta.content.length;
					sawContent = true;
					if (delta.content.length > 0) {
						options.onDelta?.({ kind: 'text', text: delta.content });
					}
				}
				// Reasoning deltas (Zhipu/DeepSeek `reasoning_content`) are not part of the final
				// message, but they are where a long GLM turn spends most of its wall clock —
				// surface them for live progress and count them toward the runaway-stream cap.
				if (
					typeof delta?.reasoning_content === 'string' &&
					delta.reasoning_content.length > 0
				) {
					accumulatedChars += delta.reasoning_content.length;
					options.onDelta?.({ kind: 'reasoning', text: delta.reasoning_content });
				}
				for (const toolCallDelta of delta?.tool_calls ?? []) {
					accumulatedChars += accumulateToolCall(toolCalls, toolCallDelta);
				}
				if (accumulatedChars > maxChars) {
					throw new Error(
						`${provider} streaming response exceeded the maximum accumulated size ` +
							`(${maxChars} chars) — aborting a runaway stream`
					);
				}
			}
		}
	} finally {
		reader.cancel().catch(() => {});
	}

	// EOF without `[DONE]` or a finish_reason means the connection dropped mid-stream. Treat it as
	// a transient network error (the "network error" phrasing is what the run's retry classifier
	// keys on) so the turn retries instead of committing a truncated response as success.
	if (!done && !finished) {
		throw new Error(
			`${provider} streaming response ended before completion (connection closed mid-stream) — network error`
		);
	}

	const message: NonNullable<NonNullable<ChatCompletionResponse['choices']>[number]['message']> =
		{};
	if (sawContent) message.content = content;
	if (toolCalls.size > 0) {
		message.tool_calls = [...toolCalls.entries()]
			.sort(([a], [b]) => a - b)
			.map(([, toolCall]) => ({
				function: {
					arguments: toolCall.arguments,
					...(toolCall.name !== undefined ? { name: toolCall.name } : {}),
				},
				...(toolCall.id !== undefined ? { id: toolCall.id } : {}),
			}));
	}
	return { choices: [{ message }], ...(usage ? { usage } : {}) };
}

interface ByteStreamReader {
	cancel(reason?: unknown): Promise<void>;
	read(): Promise<{ done?: boolean; value?: Uint8Array }>;
}

interface ToolCallDelta {
	function?: { arguments?: unknown; name?: unknown };
	id?: unknown;
	index?: unknown;
}

interface StreamChunk {
	choices?: {
		delta?: {
			content?: unknown;
			reasoning_content?: unknown;
			tool_calls?: ToolCallDelta[];
		};
		finish_reason?: unknown;
	}[];
	error?: unknown;
	usage?: ChatCompletionResponse['usage'];
}

// Returns the number of argument characters appended, so the caller can bound total accumulation.
function accumulateToolCall(
	toolCalls: Map<number, StreamedToolCall>,
	delta: ToolCallDelta
): number {
	const index = typeof delta.index === 'number' ? delta.index : toolCalls.size;
	const existing = toolCalls.get(index) ?? { arguments: '' };
	if (typeof delta.id === 'string') existing.id = delta.id;
	if (typeof delta.function?.name === 'string') existing.name = delta.function.name;
	let added = 0;
	if (typeof delta.function?.arguments === 'string') {
		existing.arguments += delta.function.arguments;
		added = delta.function.arguments.length;
	}
	toolCalls.set(index, existing);
	return added;
}

async function readWithIdleTimeout(
	reader: ByteStreamReader,
	idleMs: number,
	provider: string
): Promise<{ done?: boolean; value?: Uint8Array }> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const idleTimeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reader.cancel().catch(() => {});
			reject(
				new Error(
					`${provider} streaming response stalled: no data received for ` +
						`${Math.round(idleMs / 1000)}s — request timed out`
				)
			);
		}, idleMs);
	});
	try {
		return await Promise.race([reader.read(), idleTimeout]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}
