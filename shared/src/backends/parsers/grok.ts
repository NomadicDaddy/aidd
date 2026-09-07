import type { AgentErrorReason, AgentEvent } from '../types.ts';

import { providerErrorReason } from './flagged-text.ts';
import { finalizePlainBackend, type FinalizePlainBackendInput } from './plain.ts';

// Grok Build's headless `--output-format streaming-json` emits three JSONL envelope types and
// NOTHING else — verified against grok 0.2.101:
//   {"type":"thought","data":"…"}  reasoning deltas (token-by-token)
//   {"type":"text","data":"…"}     assistant answer deltas (token-by-token; must be concatenated)
//   {"type":"end","stopReason":…,"usage":{input_tokens,cache_read_input_tokens,output_tokens,
//                                          reasoning_tokens,total_tokens},…}
// Tool executions run silently — grok surfaces NO tool_use/tool_result events in any headless
// format — so this parser never emits tool_call/tool_result. Live rendering gets per-token
// `assistant_delta`s; the canonical full turn text is assembled once in finalize from the
// concatenated `text` deltas (assistant_delta is presentation-only and excluded from result
// parsing, per AgentEvent's contract).

function tryJson(line: string): undefined | unknown {
	try {
		return JSON.parse(line);
	} catch {
		return undefined;
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Map the terminal `end` event's `usage` into a normalized usage event.
 *
 * Grok reports DISJOINT token buckets: total = input_tokens + cache_read_input_tokens +
 * output_tokens, and reasoning_tokens ⊂ output_tokens. Normalize into aidd's convention
 * (cachedTokens ⊂ inputTokens, reasoningTokens ⊂ outputTokens):
 *   inputTokens     = input_tokens + cache_read_input_tokens  (full prompt; cached discounted)
 *   cachedTokens    = cache_read_input_tokens
 *   outputTokens    = output_tokens                           (already includes reasoning)
 *   reasoningTokens = reasoning_tokens                        (subset, priced at reasoningPerMtok=0) */
function parseUsage(usage: Record<string, unknown>): AgentEvent | undefined {
	const input = readNumber(usage.input_tokens);
	const cacheRead = readNumber(usage.cache_read_input_tokens);
	const output = readNumber(usage.output_tokens);
	const reasoning = readNumber(usage.reasoning_tokens);
	if (
		input === undefined &&
		cacheRead === undefined &&
		output === undefined &&
		reasoning === undefined
	) {
		return undefined;
	}
	const event: AgentEvent = { type: 'usage' };
	event.inputTokens = (input ?? 0) + (cacheRead ?? 0);
	event.outputTokens = output ?? 0;
	if (cacheRead !== undefined) event.cachedTokens = cacheRead;
	if (reasoning !== undefined) event.reasoningTokens = reasoning;
	return event;
}

export function parseGrokLine(line: string): AgentEvent[] {
	if (!line.trim()) return [];
	const json = asRecord(tryJson(line));
	if (json === undefined) return [];
	const envelopeType = readString(json.type);
	if (envelopeType === undefined) return [];

	if (envelopeType === 'text') {
		const data = readString(json.data);
		// Stream as a presentation-only delta; the consolidated assistant_text is built in
		// finalize so we don't flood transcripts with one assistant_text per token.
		return data === undefined ? [] : [{ chunk: data, kind: 'text', type: 'assistant_delta' }];
	}

	if (envelopeType === 'thought') {
		const data = readString(json.data);
		return data === undefined
			? []
			: [{ chunk: data, kind: 'reasoning', type: 'assistant_delta' }];
	}

	if (envelopeType === 'end') {
		const usage = asRecord(json.usage);
		const events: AgentEvent[] = [];
		if (usage !== undefined) {
			const event = parseUsage(usage);
			if (event !== undefined) events.push(event);
		}
		return events;
	}

	// Defensive: an explicit error envelope (undocumented but cheap to honor).
	if (envelopeType === 'error' || json.error !== undefined) {
		const message =
			readString(json.message) ??
			readString(asRecord(json.error)?.message) ??
			readString(json.error);
		const reason: AgentErrorReason = providerErrorReason(message);
		const events: AgentEvent[] = [];
		if (reason === 'rate_limit') events.push({ raw: json, type: 'rate_limit' });
		events.push({ meta: json, reason, type: 'error' });
		return events;
	}

	return [];
}

/** Concatenate every `text` delta in the raw stdout into the full assistant turn text. */
function assembleAssistantText(stdout: string): string {
	let text = '';
	for (const line of stdout.split(/\r?\n/)) {
		if (!line.trim()) continue;
		const json = asRecord(tryJson(line));
		if (json === undefined || readString(json.type) !== 'text') continue;
		const data = json.data;
		if (typeof data === 'string') text += data;
	}
	return text;
}

export function finalizeGrokBackend(input: FinalizePlainBackendInput): AgentEvent[] {
	const { stdout } = input;
	const events: AgentEvent[] = [];
	const assistantText = assembleAssistantText(stdout);
	if (assistantText) {
		events.push({ chunk: assistantText, type: 'assistant_text' });
	} else if (stdout.trim()) {
		// No parseable `text` deltas (malformed / truncated stream): preserve raw stdout so the
		// output is not silently dropped, matching the plain backend's fallback.
		events.push({ chunk: stdout, type: 'assistant_text' });
	}
	// Reuse the shared rate-limit / exit-code / done tail. sawAssistantText is forced true because
	// we always emit the assistant_text above; that keeps finalizePlainBackend from re-emitting the
	// raw JSON stream as a second assistant_text.
	events.push(...finalizePlainBackend({ ...input, sawAssistantText: true }));
	return events;
}

export function parseGrokBackendOutput(
	stdout: string,
	stderr: string,
	exitCode: null | number,
): AgentEvent[] {
	const events: AgentEvent[] = [];
	const combined = [stdout, stderr].filter(Boolean).join('\n');
	for (const line of combined.split(/\r?\n/)) {
		events.push(...parseGrokLine(line));
	}
	const sawRateLimit = events.some((event) => event.type === 'rate_limit');
	const sawProviderFlagged = events.some(
		(event) => event.type === 'error' && event.reason === 'provider_flagged',
	);
	events.push(
		...finalizeGrokBackend({
			exitCode,
			sawAssistantText: true,
			sawProviderFlagged,
			sawRateLimit,
			stderr,
			stdout,
		}),
	);
	return events;
}
