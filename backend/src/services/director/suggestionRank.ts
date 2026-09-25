import type { DirectorSuggestion } from 'aidd-shared';

import { suggestionTargetKey } from 'aidd-shared';

import type { DirectorPrioritizedWork } from './priority/types.ts';

/**
 * Stamps each suggestion with the rank `sortPrioritizedWork` already assigned to the
 * prioritized-work item it came from.
 *
 * The link is not a foreign key and cannot be: the fleet summary hands the model a ranked work
 * list and the model authors the suggestions, so the only thing the two ends share is what the
 * work is *about* — its project, its bucket, and the artifact it names. That is exactly the
 * identity `suggestionTargetKey` computes, and it is the same key dedup uses, so a suggestion
 * that survived dedup as "the same work" also matches as "the same work" here.
 *
 * Nothing is invented. A suggestion with no match keeps a null rank, and null sorts last.
 *
 * @param suggestions The suggestions this cycle produced.
 * @param prioritizedWork The ranked work list the cycle was handed.
 * @returns The same suggestions, each carrying its ancestor's rank or null.
 */
export function stampSuggestionRanks(
	suggestions: DirectorSuggestion[],
	prioritizedWork: DirectorPrioritizedWork[],
): DirectorSuggestion[] {
	const ranks = ancestorRanks(prioritizedWork);
	return suggestions.map((suggestion) => ({
		...suggestion,
		rank: ranks.get(suggestionTargetKey(suggestion)) ?? null,
	}));
}

/** The per-cycle ceiling `prompts/director.md` states; the prompt asks, and this enforces it. */
export const MAX_SUGGESTIONS_PER_CYCLE = 20;

/**
 * Keeps the best-ranked suggestions when a cycle produced more than the ceiling.
 *
 * The model is told to truncate and does not reliably do it: cycles have landed 25, 27 and 31.
 * This applies the prompt's own rule — the prioritized-work rank decides, and a suggestion with no
 * rank (including a "+ N more" rollup, which `ancestorRanks` never ranks) goes last, in the order
 * the model gave it. The survivors keep the model's order; only the overflow is dropped.
 *
 * @param suggestions Suggestions already stamped by `stampSuggestionRanks`.
 * @returns At most `MAX_SUGGESTIONS_PER_CYCLE` suggestions.
 */
export function capSuggestions(suggestions: DirectorSuggestion[]): DirectorSuggestion[] {
	if (suggestions.length <= MAX_SUGGESTIONS_PER_CYCLE) return suggestions;
	const keep = new Set(
		suggestions
			.map((suggestion, index) => ({ index, rank: suggestion.rank ?? Infinity }))
			.sort((left, right) => left.rank - right.rank || left.index - right.index)
			.slice(0, MAX_SUGGESTIONS_PER_CYCLE)
			.map((entry) => entry.index),
	);
	return suggestions.filter((_, index) => keep.has(index));
}

/**
 * The rank each work identity can claim, or null where it can claim none.
 *
 * Two items are deliberately excluded. A "+ N more" rollup is an aggregate, not a runnable next
 * action, and a rank on it would invite the auto-launcher to pick it. An identity carried by two
 * work items names no single ancestor, so it is recorded as ambiguous rather than letting the
 * first or last writer win — the rank is either right or absent, never a coin flip.
 *
 * @param prioritizedWork The ranked work list the cycle was handed.
 * @returns Work identity to rank, with null for the identities that can claim none.
 */
function ancestorRanks(prioritizedWork: DirectorPrioritizedWork[]): Map<string, null | number> {
	const ranks = new Map<string, null | number>();
	for (const item of prioritizedWork) {
		if (item.evidence.rolledUp !== undefined) continue;
		const key = suggestionTargetKey(item);
		ranks.set(key, ranks.has(key) ? null : item.rank);
	}
	return ranks;
}
