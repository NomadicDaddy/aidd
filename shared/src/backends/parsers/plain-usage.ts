import type { AgentEvent } from '../types.ts';

/**
 * Token/cost accounting for the plain (claude-code stream-json) parser. Kept separate from line
 * parsing because it is the one part of that parser carrying cross-line state.
 *
 * claude-code reports DISJOINT prompt buckets: the real prompt size is
 * `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. Reading `input_tokens`
 * alone is what produced console lines like `tokens: 2 in · 1 out` on a run that actually read
 * 3.2M cached tokens. Normalized into aidd's convention (cachedTokens ⊂ inputTokens):
 *   inputTokens  = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
 *   cachedTokens = cache_read_input_tokens
 *
 * Two further traps, both measured against a 36-turn Opus run (`--output-format stream-json`):
 *   - The message-level `usage` is repeated on EVERY content block of the same assistant message,
 *     so 36 turns emitted 76 usage lines. Deduplicating by `message.id` is what makes the summed
 *     prompt exact — without it that run reported 430,762 cache-creation tokens against a true
 *     117,130.
 *   - A streamed assistant line's `output_tokens` is a mid-stream snapshot, not the turn's final
 *     count: the deduplicated per-message sum was 659 against a true 22,921. Only the terminal
 *     `result` line is authoritative for output and cost.
 *
 * So per-message events carry the run's prompt growth while it works, and the terminal `result`
 * line — which reports cumulative session totals — is emitted as the remainder over what was
 * already counted, the same reconciliation the cline parser performs. Run totals are summed across
 * every `usage` event (`shared/src/orchestrator/result.ts`), so the remainder is what keeps the
 * authoritative total exact. A run that dies before `result` keeps its partial per-message usage.
 */

interface Tokens {
	cachedTokens?: number;
	costUsd?: number;
	inputTokens?: number;
	outputTokens?: number;
}

function readNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

/**
 * `prompt_tokens` / `completion_tokens` cover backends emitting OpenAI-shaped usage instead.
 *
 * `streamed` marks usage read from a still-arriving assistant message, whose `output_tokens` is a
 * snapshot of the text emitted so far rather than the turn's final count. Dropping it is what
 * keeps a `tokens: 1 out` line off the console mid-run; the prompt buckets on the same message are
 * final and are kept.
 */
function readTokens(
	usage: Record<string, unknown> | undefined,
	costUsd: number | undefined,
	streamed: boolean,
): Tokens {
	const tokens: Tokens = {};
	if (costUsd !== undefined) tokens.costUsd = costUsd;
	if (usage === undefined) return tokens;
	const input = readNumber(usage.input_tokens) ?? readNumber(usage.prompt_tokens);
	const cacheCreation = readNumber(usage.cache_creation_input_tokens);
	const cacheRead = readNumber(usage.cache_read_input_tokens);
	const output = readNumber(usage.output_tokens) ?? readNumber(usage.completion_tokens);
	if (input !== undefined || cacheCreation !== undefined || cacheRead !== undefined) {
		tokens.inputTokens = (input ?? 0) + (cacheCreation ?? 0) + (cacheRead ?? 0);
	}
	if (cacheRead !== undefined) tokens.cachedTokens = cacheRead;
	if (output !== undefined && !streamed) tokens.outputTokens = output;
	return tokens;
}

interface Totals {
	cachedTokens: number;
	costUsd: number;
	inputTokens: number;
	outputTokens: number;
}

/** What a cumulative report still owes on top of everything already counted. */
function remainder(tokens: Tokens, emitted: Totals): Tokens {
	const left: Tokens = {};
	const cached = (tokens.cachedTokens ?? 0) - emitted.cachedTokens;
	// Cost is a float sum; ignore sub-hundredth-of-a-cent drift rather than noise.
	const cost = (tokens.costUsd ?? 0) - emitted.costUsd;
	const input = (tokens.inputTokens ?? 0) - emitted.inputTokens;
	const output = (tokens.outputTokens ?? 0) - emitted.outputTokens;
	if (cached > 0) left.cachedTokens = cached;
	if (cost > 1e-6) left.costUsd = cost;
	if (input > 0) left.inputTokens = input;
	if (output > 0) left.outputTokens = output;
	return left;
}

function toEvent(tokens: Tokens): AgentEvent | undefined {
	const { cachedTokens, costUsd, inputTokens, outputTokens } = tokens;
	if (
		cachedTokens === undefined &&
		costUsd === undefined &&
		inputTokens === undefined &&
		outputTokens === undefined
	) {
		return undefined;
	}
	const event: AgentEvent = { type: 'usage' };
	if (cachedTokens !== undefined) event.cachedTokens = cachedTokens;
	if (costUsd !== undefined) event.costUsd = costUsd;
	if (inputTokens !== undefined) event.inputTokens = inputTokens;
	if (outputTokens !== undefined) event.outputTokens = outputTokens;
	return event;
}

export interface PlainUsageReconciler {
	usageEvents: (json: unknown) => AgentEvent[];
}

export function createPlainUsageReconciler(): PlainUsageReconciler {
	const emitted = { cachedTokens: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
	const countedMessages = new Set<string>();

	return {
		usageEvents(json): AgentEvent[] {
			const record = readRecord(json);
			if (record === undefined) return [];
			const topLevel = readRecord(record.usage);
			const usage = topLevel ?? readRecord(readRecord(record.message)?.usage);
			const costUsd =
				readNumber(record.total_cost_usd) ??
				(usage === undefined ? undefined : readNumber(usage.cost_usd));
			if (usage === undefined && costUsd === undefined) return [];

			// The terminal envelope reports the session's cumulative totals; every other line
			// reports one assistant message's own usage, repeated per content block.
			const cumulative = record.type === 'result';
			if (!cumulative) {
				const id = readRecord(record.message)?.id;
				if (typeof id === 'string') {
					if (countedMessages.has(id)) return [];
					countedMessages.add(id);
				}
			}

			const tokens = readTokens(
				usage,
				costUsd,
				usage !== undefined && topLevel === undefined,
			);
			const counted = cumulative ? remainder(tokens, emitted) : tokens;

			const event = toEvent(counted);
			if (event === undefined) return [];
			emitted.cachedTokens += counted.cachedTokens ?? 0;
			emitted.costUsd += counted.costUsd ?? 0;
			emitted.inputTokens += counted.inputTokens ?? 0;
			emitted.outputTokens += counted.outputTokens ?? 0;
			return [event];
		},
	};
}
