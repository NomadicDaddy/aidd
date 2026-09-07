import type { AgentErrorReason, AgentEvent } from '../types.ts';

import { createClineUsageReconciler, parseAggregateUsage, parseTurnUsage } from './cline-usage.ts';
import { providerErrorReason } from './flagged-text.ts';
import { finalizePlainBackend, type FinalizePlainBackendInput } from './plain.ts';

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

function errorMessage(value: Record<string, unknown>): string | undefined {
	const error = asRecord(value.error);
	return (
		readString(value.message) ??
		readString(value.error) ??
		readString(error?.message) ??
		readString(value.text)
	);
}

function parseError(value: Record<string, unknown>, fatal: boolean): AgentEvent[] {
	const message = errorMessage(value);
	const reason: AgentErrorReason = providerErrorReason(message);
	const events: AgentEvent[] = [];
	if (reason === 'rate_limit') events.push({ raw: value, type: 'rate_limit' });
	events.push({ fatal, meta: value, reason, type: 'error' });
	return events;
}

function parseContentStart(event: Record<string, unknown>): AgentEvent[] {
	const contentType = readString(event.contentType);
	if (contentType === 'text') {
		const text = readString(event.text);
		return text === undefined ? [] : [{ chunk: text, kind: 'text', type: 'assistant_delta' }];
	}
	if (contentType === 'reasoning') {
		const reasoning = readString(event.reasoning);
		return reasoning === undefined
			? []
			: [{ chunk: reasoning, kind: 'reasoning', type: 'assistant_delta' }];
	}
	if (contentType === 'tool') {
		return [
			{
				args: event.input ?? {},
				tool: readString(event.toolName) ?? 'unknown',
				type: 'tool_call',
			},
		];
	}
	return [];
}

function parseContentEnd(event: Record<string, unknown>): AgentEvent[] {
	if (readString(event.contentType) !== 'tool') return [];
	const result = event.error ?? event.output;
	return [
		{
			result: result ?? '',
			tool: readString(event.toolName) ?? 'unknown',
			type: 'tool_result',
		},
	];
}

function parseAgentEvent(event: Record<string, unknown>): AgentEvent[] {
	const type = readString(event.type);
	if (type === 'content_start') return parseContentStart(event);
	if (type === 'content_end') return parseContentEnd(event);
	if (type === 'usage') {
		const usage = parseTurnUsage(event);
		return usage === undefined ? [] : [usage];
	}
	if (type === 'error') {
		// Cline retries recoverable agent errors internally. Keep them in raw logs without
		// overriding the authoritative run_result that follows.
		return event.recoverable === true ? [] : parseError(event, true);
	}
	return [];
}

function parseRunResult(json: Record<string, unknown>): AgentEvent[] {
	const events: AgentEvent[] = [];
	const usage = asRecord(json.aggregateUsage) ?? asRecord(json.usage);
	if (usage !== undefined) {
		const usageEvent = parseAggregateUsage(usage);
		if (usageEvent !== undefined) events.push(usageEvent);
	}
	const text = readString(json.text);
	if (text !== undefined) events.push({ chunk: text, type: 'assistant_text' });
	const finishReason = readString(json.finishReason);
	if (finishReason !== undefined && finishReason !== 'completed') {
		events.push(...parseError({ ...json, message: text ?? finishReason }, true));
	}
	return events;
}

function parseLegacyEvent(json: Record<string, unknown>): AgentEvent[] {
	const type = readString(json.type);
	if (type !== 'ask' && type !== 'say') return [];
	const text = readString(json.text) ?? readString(json.reasoning);
	if (text === undefined) return [];
	if (json.partial === true) {
		return [
			{
				chunk: text,
				kind: json.reasoning !== undefined ? 'reasoning' : 'text',
				type: 'assistant_delta',
			},
		];
	}
	return type === 'say' ? [{ chunk: text, type: 'assistant_text' }] : [];
}

/**
 * Line-local parse with no cross-line state. A `usage` agent_event and the terminal `run_result`
 * aggregate both yield `usage` events here, so callers that sum totals must go through
 * `createClineBackendParser` / `parseClineBackendOutput`, which reconcile the two.
 */
export function parseClineBackendLine(line: string): AgentEvent[] {
	if (!line.trim()) return [];
	const json = asRecord(tryJson(line));
	if (json === undefined) return [];
	const type = readString(json.type);
	if (type === 'agent_event') {
		const event = asRecord(json.event);
		return event === undefined ? [] : parseAgentEvent(event);
	}
	if (type === 'run_result') return parseRunResult(json);
	if (type === 'error') return parseError(json, true);
	return parseLegacyEvent(json);
}

export interface ClineBackendParser {
	finalize: (input: FinalizePlainBackendInput) => AgentEvent[];
	parseLine: (line: string) => AgentEvent[];
}

export function createClineBackendParser(): ClineBackendParser {
	let lastLegacyAssistant: string | undefined;
	let modernResult: Record<string, unknown> | undefined;
	const usage = createClineUsageReconciler();

	return {
		finalize(input): AgentEvent[] {
			const resultEvents: AgentEvent[] =
				modernResult !== undefined
					? usage.reconcile(parseRunResult(modernResult))
					: lastLegacyAssistant !== undefined
						? [{ chunk: lastLegacyAssistant, type: 'assistant_text' }]
						: [];
			const sawResultText = resultEvents.some((event) => event.type === 'assistant_text');
			const sawResultRateLimit = resultEvents.some((event) => event.type === 'rate_limit');
			return [
				...resultEvents,
				...finalizePlainBackend({
					...input,
					// An empty modern result is still structured output. Do not replace it with
					// the raw NDJSON transcript.
					sawAssistantText:
						input.sawAssistantText || sawResultText || modernResult !== undefined,
					sawRateLimit: input.sawRateLimit || sawResultRateLimit,
				}),
			];
		},
		parseLine(line): AgentEvent[] {
			const json = asRecord(tryJson(line));
			if (json === undefined) return parseClineBackendLine(line);
			const type = readString(json.type);
			if (type === 'run_result') {
				modernResult = json;
				return [];
			}
			if (type === 'say' && json?.partial !== true && modernResult === undefined) {
				const text = readString(json.text) ?? readString(json.reasoning);
				if (text !== undefined) lastLegacyAssistant = text;
				return [];
			}
			return usage.track(parseClineBackendLine(line));
		},
	};
}

export function parseClineBackendOutput(
	stdout: string,
	stderr: string,
	exitCode: null | number,
): AgentEvent[] {
	const parser = createClineBackendParser();
	const events: AgentEvent[] = [];
	for (const line of [stdout, stderr].filter(Boolean).join('\n').split(/\r?\n/)) {
		events.push(...parser.parseLine(line));
	}
	const sawAssistantText = events.some((event) => event.type === 'assistant_text');
	const sawRateLimit = events.some((event) => event.type === 'rate_limit');
	const sawProviderFlagged = events.some(
		(event) => event.type === 'error' && event.reason === 'provider_flagged',
	);
	events.push(
		...parser.finalize({
			exitCode,
			sawAssistantText,
			sawProviderFlagged,
			sawRateLimit,
			stderr,
			stdout,
		}),
	);
	return events;
}

/**
 * Drop the `accumulated` field cline attaches to every text delta before the line reaches the run
 * log. Each delta re-sends the entire assistant message so far, so a run's transcript grows
 * quadratically — a read-only doc review measured 5.4 MB, of which ~95% was these re-sends. That
 * bloat pushes the run's actual tool calls out of both the server's tail cap and the console's
 * render window, so the Live Console shows no tool calls for a run whose own stats report a dozen.
 * Nothing in aidd reads `accumulated` (the deltas carry the same text incrementally), so removing
 * it loses nothing.
 */
export function compactClineLogLine(line: string): string {
	if (!line.includes('"accumulated"')) return line;
	const parsed = asRecord(tryJson(line));
	const event = asRecord(parsed?.event);
	if (event === undefined || event.accumulated === undefined) return line;
	delete event.accumulated;
	return JSON.stringify(parsed);
}
