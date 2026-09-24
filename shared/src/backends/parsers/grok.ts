import type { AgentErrorReason, AgentEvent } from '../types.ts';

import { providerErrorReason } from './flagged-text.ts';
import { finalizePlainBackend, type FinalizePlainBackendInput } from './plain.ts';

// Grok Build's headless `--output-format streaming-json` emits NDJSON, one envelope per line.
// Verified against grok 1.0.41, which documents the format as "one ACP session update per line";
// these are the envelope shapes it actually writes:
//   {"type":"available_commands","tools":[…],"commands":[…]}  session preamble, repeated per turn
//   {"type":"thought","data":"…"}   reasoning deltas (token-by-token)
//   {"type":"text","data":"…"}      assistant answer deltas (token-by-token; must be concatenated)
//   {"type":"tool_call","toolCallId":…,"toolName":…,"rawInput":{…},"status":"pending"}
//   {"type":"tool_call_update","toolCallId":…,"status":"completed"|null,"rawOutput":…}
//   {"type":"usage","usage":{…}}    per-model-call usage, one per turn of the agent loop
//   {"type":"end","stopReason":…,"usage":{…},"total_cost_usd":…}
//
// Tool activity is reported as of grok 1.x. Builds up to 0.2.101 ran tools silently and emitted
// only thought/text/end, so this parser dropped tool events by documented design — which also left
// the flailing guard blind on this backend, because it infers a repeated dead action purely from
// tool_call/tool_result. Only `tool_call` names the tool, so resolving that name for the matching
// result needs state across lines; `createGrokBackendParser` carries the map.
//
// Live rendering gets per-token `assistant_delta`s; the canonical full turn text is assembled once
// in finalize from the concatenated `text` deltas (assistant_delta is presentation-only and
// excluded from result parsing, per AgentEvent's contract).

type UsageEvent = Extract<AgentEvent, { type: 'usage' }>;

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
function parseUsage(usage: Record<string, unknown>): undefined | UsageEvent {
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
	const event: UsageEvent = { type: 'usage' };
	event.inputTokens = (input ?? 0) + (cacheRead ?? 0);
	event.outputTokens = output ?? 0;
	if (cacheRead !== undefined) event.cachedTokens = cacheRead;
	if (reasoning !== undefined) event.reasoningTokens = reasoning;
	return event;
}

/**
 * Whether a `tool_call_update` reports the action as finished. ACP also sends updates mid-flight
 * (`status: null` while locations resolve, `pending`, `in_progress`); turning those into a
 * tool_result would both fabricate a result and clear the flailing detector's pending-call count
 * before the action has reported back. Any other value is read as terminal so a status this build
 * has not seen still closes the call out.
 */
function isTerminalToolStatus(status: unknown): boolean {
	const value = readString(status);
	return value !== undefined && value !== 'in_progress' && value !== 'pending';
}

function parseEndEnvelope(json: Record<string, unknown>): AgentEvent[] {
	const usage = asRecord(json.usage);
	const event = usage === undefined ? undefined : parseUsage(usage);
	const costUsd = readNumber(json.total_cost_usd);
	if (event !== undefined) {
		if (costUsd !== undefined) event.costUsd = costUsd;
		return [event];
	}
	return costUsd === undefined ? [] : [{ costUsd, type: 'usage' }];
}

function parseErrorEnvelope(json: Record<string, unknown>): AgentEvent[] {
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

function parseToolCall(
	json: Record<string, unknown>,
	toolNames: Map<string, string> | undefined,
): AgentEvent[] {
	const tool = readString(json.toolName) ?? readString(json.title) ?? 'unknown';
	const toolCallId = readString(json.toolCallId);
	if (toolCallId !== undefined) toolNames?.set(toolCallId, tool);
	return [{ args: json.rawInput ?? {}, tool, type: 'tool_call' }];
}

function parseToolCallUpdate(
	json: Record<string, unknown>,
	toolNames: Map<string, string> | undefined,
): AgentEvent[] {
	if (!isTerminalToolStatus(json.status)) return [];
	const toolCallId = readString(json.toolCallId);
	// Falls back to the payload's own discriminator (`rawOutput.type`, e.g. `ListDir`) when no
	// map is carried, which is the stateless entry point's best available name.
	const tool =
		(toolCallId === undefined ? undefined : toolNames?.get(toolCallId)) ??
		readString(asRecord(json.rawOutput)?.type) ??
		'unknown';
	if (toolCallId !== undefined) toolNames?.delete(toolCallId);
	return [{ result: json.rawOutput ?? json.content ?? null, tool, type: 'tool_result' }];
}

/**
 * `toolNames` carries `toolCallId` → tool name across lines so a `tool_call_update` — which names
 * only the id — can report the tool it belongs to. Omitted by the stateless entry point.
 */
function parseGrokEnvelope(line: string, toolNames: Map<string, string> | undefined): AgentEvent[] {
	if (!line.trim()) return [];
	const json = asRecord(tryJson(line));
	if (json === undefined) return [];
	const envelopeType = readString(json.type);
	if (envelopeType === undefined) return [];

	if (envelopeType === 'text') {
		const data = readString(json.data);
		// Stream as a presentation-only delta; the consolidated assistant_text is built in
		// finalize so transcripts do not carry one assistant_text per token.
		return data === undefined ? [] : [{ chunk: data, kind: 'text', type: 'assistant_delta' }];
	}

	if (envelopeType === 'thought') {
		const data = readString(json.data);
		return data === undefined
			? []
			: [{ chunk: data, kind: 'reasoning', type: 'assistant_delta' }];
	}

	if (envelopeType === 'tool_call') return parseToolCall(json, toolNames);
	if (envelopeType === 'tool_call_update') return parseToolCallUpdate(json, toolNames);
	if (envelopeType === 'end') return parseEndEnvelope(json);

	// Session framing, and per-model-call usage that `end.usage` already sums. Claimed and
	// deliberately silent: aidd's result aggregation ADDS every usage event, so emitting these
	// alongside `end` would double every grok run's tokens (verified on a two-call turn,
	// 25898 + 258 === end's 26156).
	if (envelopeType === 'available_commands' || envelopeType === 'usage') return [];

	// Defensive: an explicit error envelope (undocumented but cheap to honor).
	if (envelopeType === 'error' || json.error !== undefined) return parseErrorEnvelope(json);

	return [];
}

/**
 * Stateless single-line parse, for transcripts where grok envelopes appear among another
 * backend's (a triumvirate stage) and no per-run state is available.
 */
export function parseGrokLine(line: string): AgentEvent[] {
	return parseGrokEnvelope(line, undefined);
}

export interface GrokBackendParser {
	finalize: (input: FinalizePlainBackendInput) => AgentEvent[];
	parseLine: (line: string) => AgentEvent[];
}

/** Per-run parser. Stateful only in the `toolCallId` → tool-name map described above. */
export function createGrokBackendParser(): GrokBackendParser {
	const toolNames = new Map<string, string>();
	return {
		finalize: finalizeGrokBackend,
		parseLine: (line) => parseGrokEnvelope(line, toolNames),
	};
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
	const parser = createGrokBackendParser();
	const events: AgentEvent[] = [];
	const combined = [stdout, stderr].filter(Boolean).join('\n');
	for (const line of combined.split(/\r?\n/)) {
		events.push(...parser.parseLine(line));
	}
	const sawRateLimit = events.some((event) => event.type === 'rate_limit');
	const sawProviderFlagged = events.some(
		(event) => event.type === 'error' && event.reason === 'provider_flagged',
	);
	events.push(
		...parser.finalize({
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
