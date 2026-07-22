import { desc, gte } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';

import { suggestions } from '../../db/schema.ts';
import { suggestionDedupKey } from './helpers.ts';

export interface SuggestionHistoryEntry {
	createdAt: string;
	dismissedBy: null | string;
	occurrences: number;
	projectId: null | string;
	status: string;
	taskType: string;
	title: string;
}

/**
 * Recent suggestion history for the director prompt, collapsed by (project, title) with an
 * occurrence count — 12 projects × 5 cycles of identical "reconcile aidd artifacts" titles
 * stays compact. The most recent row per key wins for status/dismissedBy, so the model sees
 * the latest outcome of each item it previously suggested.
 * @param db - Web database handle.
 * @param options - History window bounds.
 * @param options.sinceMs - Lower bound on suggestion createdAt.
 * @param options.limit - Maximum collapsed entries returned (default 100).
 * @returns Collapsed entries, newest first.
 */
const historyPageSize = 1000;
// Runaway backstop far above any realistic 14-day suggestion volume (~10 rows/cycle × 2
// cycles/day), so pagination always terminates even against pathological data.
const historyRowCap = 50_000;

export async function readRecentSuggestionHistory(
	db: WebDatabase,
	options: { limit?: number; sinceMs: number }
): Promise<SuggestionHistoryEntry[]> {
	const limit = options.limit ?? 100;
	const collapsed = new Map<string, SuggestionHistoryEntry>();
	// Page through the ENTIRE window before truncating: collapsing happens per (project, title)
	// key, and heavy repetition — the exact pathology this history exists to expose — would
	// otherwise crowd distinct recent dismissals out of a single fixed-size page.
	let scanned = 0;
	for (let offset = 0; scanned < historyRowCap; offset += historyPageSize) {
		const rows = await db
			.select({
				createdAt: suggestions.createdAt,
				dismissedBy: suggestions.dismissedBy,
				projectId: suggestions.projectId,
				status: suggestions.status,
				taskType: suggestions.taskType,
				title: suggestions.title,
			})
			.from(suggestions)
			.where(gte(suggestions.createdAt, options.sinceMs))
			.orderBy(desc(suggestions.createdAt), desc(suggestions.id))
			.limit(historyPageSize)
			.offset(offset);
		for (const row of rows) {
			const key = suggestionDedupKey(row.projectId, row.title);
			const existing = collapsed.get(key);
			if (existing) {
				existing.occurrences += 1;
				continue;
			}
			collapsed.set(key, {
				createdAt: new Date(row.createdAt).toISOString(),
				dismissedBy: row.dismissedBy,
				occurrences: 1,
				projectId: row.projectId,
				status: row.status,
				taskType: row.taskType,
				title: row.title,
			});
		}
		scanned += rows.length;
		if (rows.length < historyPageSize) break;
	}
	return [...collapsed.values()].slice(0, limit);
}
