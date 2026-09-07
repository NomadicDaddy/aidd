import { and, eq, gte, inArray } from 'drizzle-orm';

import type {
	LocalTransaction,
	PersistCycleResultArgs,
	PersistCycleResultOutcome,
} from './types.ts';

import { createSuggestionId, suggestionDedupKey } from '../../services/director/helpers.ts';
import { directorCycles, suggestions } from '../schema.ts';

export function persistCycleResult(
	tx: LocalTransaction,
	args: PersistCycleResultArgs,
): PersistCycleResultOutcome {
	const { createdAt, cycleId, cycleUpdate, dedupWindowMs, suggestions: batch } = args;
	// Suggestions the operator explicitly dismissed within the window suppress identical
	// re-suggestions. Only dismissedBy='user' counts: the per-cycle retire sweep below also sets
	// status='dismissed', and counting those would suppress everything ever suggested.
	const suppressed = new Set<string>();
	if (cycleUpdate.status === 'completed' && dedupWindowMs > 0) {
		const recentlyDismissed = tx
			.select({ projectId: suggestions.projectId, title: suggestions.title })
			.from(suggestions)
			.where(
				and(
					eq(suggestions.status, 'dismissed'),
					eq(suggestions.dismissedBy, 'user'),
					gte(suggestions.resolvedAt, createdAt - dedupWindowMs),
				),
			)
			.all();
		for (const row of recentlyDismissed) {
			suppressed.add(suggestionDedupKey(row.projectId, row.title));
		}
	}
	if (cycleUpdate.status === 'completed') {
		// A fresh, completed cycle supersedes every prior actionable suggestion, so retire them
		// before inserting the new batch. This sweeps not only 'pending' rows but also any
		// 'launching' rows orphaned by a launch that never finalized (e.g. the spawning process
		// died between the pending->launching claim and the launching->launched write). Such rows
		// are un-removable through the UI — Launch is disabled for non-pending and Dismiss is
		// disabled while launching — so without this they linger forever as aged/expired leftovers.
		// The new suggestions are inserted as 'pending' *after* this update, so they are unaffected.
		tx.update(suggestions)
			.set({ dismissedBy: 'cycle_retire', resolvedAt: createdAt, status: 'dismissed' })
			.where(inArray(suggestions.status, ['launching', 'pending']))
			.run();
	}
	let inserted = 0;
	let suppressedCount = 0;
	for (const suggestion of batch) {
		if (suppressed.has(suggestionDedupKey(suggestion.projectId, suggestion.title))) {
			suppressedCount += 1;
			continue;
		}
		tx.insert(suggestions)
			.values({
				confidence: suggestion.confidence ?? null,
				createdAt,
				cycleId,
				description: suggestion.description,
				evidence: JSON.stringify(suggestion.evidence),
				id: createSuggestionId(),
				projectId: suggestion.projectId,
				rank: suggestion.rank ?? null,
				reasoning: suggestion.reasoning,
				riskLevel: suggestion.riskLevel,
				status: 'pending',
				suggestedArgs: suggestion.suggestedArgs
					? JSON.stringify(suggestion.suggestedArgs)
					: null,
				suggestedRecipe: suggestion.suggestedRecipe ?? null,
				taskType: suggestion.taskType,
				title: suggestion.title,
			})
			.run();
		inserted += 1;
	}
	// totalSuggestions reflects what actually landed, not what the model produced.
	tx.update(directorCycles)
		.set({ ...cycleUpdate, totalSuggestions: inserted, ...autoLaunchFields(tx, args) })
		.where(eq(directorCycles.id, cycleId))
		.run();
	return { inserted, suppressed: suppressedCount };
}

/**
 * The durable auto-launch decision, folded into the same UPDATE as the terminal cycle write.
 *
 * One statement rather than two, because the pair has to be indivisible: a cycle whose suggestions
 * are committed without the obligation to consider them is exactly the state a restart used to
 * strand — the suggestions sat there and nothing was ever going to look at them again.
 *
 * Whether the cycle is one the Director started is read from the row here rather than taken from
 * the caller. A person pressing Run cycle is already watching the result and is owed no dispatch,
 * and that fact belongs to the cycle, not to whoever happens to be persisting it.
 *
 * @param tx The transaction the cycle's results are being committed in.
 * @param args The persist arguments, whose `autoLaunchDecision` may be absent.
 * @returns The columns to merge into the terminal update; empty when no decision applies.
 */
function autoLaunchFields(
	tx: LocalTransaction,
	args: PersistCycleResultArgs,
): { autoLaunchBounds: string; autoLaunchState: 'disabled' | 'pending' } | Record<string, never> {
	const decision = args.autoLaunchDecision;
	if (!decision || args.cycleUpdate.status !== 'completed') return {};
	const row = tx
		.select({ initiator: directorCycles.initiator })
		.from(directorCycles)
		.where(eq(directorCycles.id, args.cycleId))
		.get();
	if (row?.initiator !== 'automatic') return {};
	return { autoLaunchBounds: decision.bounds, autoLaunchState: decision.state };
}
