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
		.set({ ...cycleUpdate, totalSuggestions: inserted })
		.where(eq(directorCycles.id, cycleId))
		.run();
	return { inserted, suppressed: suppressedCount };
}
