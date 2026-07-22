import type { AgentEvent, AgentErrorReason } from '../types.ts';

import { finalizePlainBackend, type FinalizePlainBackendInput } from './plain.ts';
import { isRateLimitText } from './rate-limit-text.ts';

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

/** Map a step-finish `tokens` object into a usage event.
 *
 * kilo/opencode (shared lineage) report DISJOINT token buckets:
 *   total = input + output + reasoning + cache.read + cache.write
 * i.e. `cache.read` is NOT part of `input` and `reasoning` is NOT part of `output` — the
 * opposite of the OpenAI Responses convention codex uses. We normalize into the shared
 * AgentEvent convention (cachedTokens ⊂ inputTokens, reasoningTokens ⊂ outputTokens) so the
 * existing metrics + cost-estimate pipeline prices it correctly:
 *   inputTokens     = input + cache.read + cache.write  (total prompt; fresh + cache-write at
 *                     the full input rate, cache.read discounted via cachedPerMtok)
 *   cachedTokens    = cache.read
 *   outputTokens    = output + reasoning                (reasoning billed at the output rate)
 *   reasoningTokens = reasoning                         (subset, priced at reasoningPerMtok=0) */
function parseTokens(tokens: Record<string, unknown>): AgentEvent | undefined {
	const input = readNumber(tokens.input);
	const output = readNumber(tokens.output);
	const reasoning = readNumber(tokens.reasoning);
	const cache = asRecord(tokens.cache);
	const cacheRead = readNumber(cache?.read);
	const cacheWrite = readNumber(cache?.write);
	if (
		input === undefined &&
		output === undefined &&
		reasoning === undefined &&
		cacheRead === undefined &&
		cacheWrite === undefined
	) {
		return undefined;
	}
	const event: AgentEvent = { type: 'usage' };
	event.inputTokens = (input ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0);
	event.outputTokens = (output ?? 0) + (reasoning ?? 0);
	if (cacheRead !== undefined) event.cachedTokens = cacheRead;
	if (reasoning !== undefined) event.reasoningTokens = reasoning;
	return event;
}

function parseStepFinish(part: Record<string, unknown>): AgentEvent[] {
	const events: AgentEvent[] = [];
	const tokens = asRecord(part.tokens);
	if (tokens !== undefined) {
		const usage = parseTokens(tokens);
		if (usage !== undefined) {
			// `cost` is authoritative metered spend when positive; many providers (e.g. glm via a
			// subscription) report 0 here, in which case the benchmark estimates from the tokens.
			const cost = readNumber(part.cost);
			if (cost !== undefined && usage.type === 'usage') usage.costUsd = cost;
			events.push(usage);
		}
	}
	return events;
}

function parseToolUse(part: Record<string, unknown>): AgentEvent[] {
	const events: AgentEvent[] = [];
	const tool = readString(part.tool) ?? 'unknown';
	const state = asRecord(part.state);
	const input = state?.input;
	events.push({ args: input ?? {}, tool, type: 'tool_call' });
	const output = readString(state?.output);
	if (output !== undefined) {
		events.push({ result: output, tool, type: 'tool_result' });
	}
	return events;
}

function parseError(json: Record<string, unknown>, part: Record<string, unknown>): AgentEvent[] {
	const events: AgentEvent[] = [];
	const message =
		readString(part.error) ??
		readString(asRecord(part.error)?.message) ??
		readString(json.message) ??
		readString(json.error);
	const reason: AgentErrorReason = isRateLimitText(message) ? 'rate_limit' : 'provider';
	if (reason === 'rate_limit') events.push({ raw: json, type: 'rate_limit' });
	events.push({ meta: json, reason, type: 'error' });
	return events;
}

export function parseOpencodeFamilyLine(line: string): AgentEvent[] {
	if (!line.trim()) return [];
	const json = asRecord(tryJson(line));
	if (json === undefined) return [];
	const envelopeType = readString(json.type);
	if (envelopeType === undefined) return [];
	const part = asRecord(json.part) ?? {};

	if (envelopeType === 'step_finish') return parseStepFinish(part);
	if (envelopeType === 'tool_use') return parseToolUse(part);
	if (envelopeType === 'text') {
		const text = readString(part.text);
		return text === undefined ? [] : [{ chunk: text, type: 'assistant_text' }];
	}
	if (envelopeType === 'error' || part.error !== undefined) return parseError(json, part);

	return [];
}

export function finalizeOpencodeFamilyBackend(input: FinalizePlainBackendInput): AgentEvent[] {
	return finalizePlainBackend(input);
}

export function parseOpencodeFamilyOutput(
	stdout: string,
	stderr: string,
	exitCode: null | number
): AgentEvent[] {
	const events: AgentEvent[] = [];
	const combined = [stdout, stderr].filter(Boolean).join('\n');
	for (const line of combined.split(/\r?\n/)) {
		events.push(...parseOpencodeFamilyLine(line));
	}
	const sawAssistantText = events.some((event) => event.type === 'assistant_text');
	const sawRateLimit = events.some((event) => event.type === 'rate_limit');
	events.push(
		...finalizeOpencodeFamilyBackend({
			exitCode,
			sawAssistantText,
			sawRateLimit,
			stderr,
			stdout,
		})
	);
	return events;
}
