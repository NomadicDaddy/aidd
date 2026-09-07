import type { AgentEvent } from '../types.ts';

/**
 * Token/cost accounting for the cline parser. Kept separate from line parsing because it is the
 * one part of that parser carrying cross-line state: cline reports usage twice (per iteration and
 * again as a terminal aggregate) and the two must be reconciled, not both counted.
 */

function readNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function usageEvent(
	inputTokens: number | undefined,
	outputTokens: number | undefined,
	cachedTokens: number | undefined,
	costUsd: number | undefined,
): AgentEvent | undefined {
	if (
		inputTokens === undefined &&
		outputTokens === undefined &&
		cachedTokens === undefined &&
		costUsd === undefined
	) {
		return undefined;
	}
	const event: AgentEvent = { type: 'usage' };
	if (inputTokens !== undefined) event.inputTokens = inputTokens;
	if (outputTokens !== undefined) event.outputTokens = outputTokens;
	if (cachedTokens !== undefined) event.cachedTokens = cachedTokens;
	if (costUsd !== undefined) event.costUsd = costUsd;
	return event;
}

/**
 * Cline's per-iteration `usage` agent_event carries BOTH the turn's own numbers
 * (`inputTokens` / `outputTokens` / `cacheReadTokens` / `cost`) and the run's running totals
 * (`total*`). Verified against cline 3.0.47: a three-iteration run reported per-turn
 * `inputTokens` 5768 / 6177 / 6347 alongside `totalInputTokens` 5768 / 11945 / 18292, and the
 * final `run_result.aggregateUsage.inputTokens` (18292) equalled the per-turn sum. Read the
 * per-turn fields only — `parseAggregateUsage` prefers `totalCost`, which is cumulative on these
 * events and would over-report every iteration after the first.
 */
export function parseTurnUsage(value: Record<string, unknown>): AgentEvent | undefined {
	return usageEvent(
		readNumber(value.inputTokens),
		readNumber(value.outputTokens),
		readNumber(value.cacheReadTokens),
		readNumber(value.cost),
	);
}

/** Terminal `run_result` usage, where the cumulative fields are the correct ones to read. */
export function parseAggregateUsage(value: Record<string, unknown>): AgentEvent | undefined {
	return usageEvent(
		readNumber(value.inputTokens) ?? readNumber(value.input_tokens),
		readNumber(value.outputTokens) ?? readNumber(value.output_tokens),
		readNumber(value.cacheReadTokens) ?? readNumber(value.cache_read_tokens),
		readNumber(value.totalCost) ?? readNumber(value.cost) ?? readNumber(value.total_cost_usd),
	);
}

export interface ClineUsageReconciler {
	reconcile: (events: AgentEvent[]) => AgentEvent[];
	track: (events: AgentEvent[]) => AgentEvent[];
}

export function createClineUsageReconciler(): ClineUsageReconciler {
	const emitted = { cachedTokens: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };

	return {
		/**
		 * Run totals are summed across every `usage` event (`shared/src/orchestrator/result.ts`), so
		 * the terminal aggregate must be reduced by whatever the per-iteration events already
		 * reported. Reconciling against cline's aggregate — rather than trusting the running sum —
		 * keeps its authoritative total exact even if an iteration's usage line was missing or
		 * unparseable. A run that dies before `run_result` keeps the partial per-iteration usage.
		 */
		reconcile(events): AgentEvent[] {
			return events.flatMap((event): AgentEvent[] => {
				if (event.type !== 'usage') return [event];
				const remainder = usageEvent(
					positive((event.inputTokens ?? 0) - emitted.inputTokens),
					positive((event.outputTokens ?? 0) - emitted.outputTokens),
					positive((event.cachedTokens ?? 0) - emitted.cachedTokens),
					// Cost is a float sum; ignore sub-hundredth-of-a-cent drift rather than noise.
					positive((event.costUsd ?? 0) - emitted.costUsd, 1e-6),
				);
				return remainder === undefined ? [] : [remainder];
			});
		},
		track(events): AgentEvent[] {
			for (const event of events) {
				if (event.type !== 'usage') continue;
				emitted.cachedTokens += event.cachedTokens ?? 0;
				emitted.costUsd += event.costUsd ?? 0;
				emitted.inputTokens += event.inputTokens ?? 0;
				emitted.outputTokens += event.outputTokens ?? 0;
			}
			return events;
		},
	};
}

function positive(value: number, epsilon = 0): number | undefined {
	return value > epsilon ? value : undefined;
}
