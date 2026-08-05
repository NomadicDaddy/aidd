import type { DiaryEntry, DiaryTimelineItem, DiaryTimelineKind } from '../../api/types.ts';

export type DiaryKindFilter = 'all' | DiaryTimelineKind;
export type DiaryWindowFilter = '30d' | '7d' | 'all';

const WINDOW_DAYS: Record<DiaryWindowFilter, null | number> = { '30d': 30, '7d': 7, all: null };

/**
 * Oldest timestamp a window admits, or `null` when the window is unbounded. Both filters run over
 * the pages already fetched, so narrowing never costs a request — it only ever hides rows the feed
 * has in hand.
 */
export function windowStart(window: DiaryWindowFilter, now: number): null | number {
	const days = WINDOW_DAYS[window];
	return days === null ? null : now - days * 24 * 60 * 60 * 1000;
}

export function filterTimelineItems(
	items: DiaryTimelineItem[],
	kind: DiaryKindFilter,
	window: DiaryWindowFilter,
	now: number,
): DiaryTimelineItem[] {
	const start = windowStart(window, now);
	return items.filter(
		(item) =>
			(kind === 'all' || item.kind === kind) && (start === null || item.startedAt >= start),
	);
}

/**
 * Narrative entries are not one of the five timeline kinds, so selecting a specific kind hides
 * them: the control reads as "show me only releases", and leaving prose in the feed would
 * contradict that. They return with the `all` selection.
 */
export function filterDiaryEntries(
	entries: DiaryEntry[],
	kind: DiaryKindFilter,
	window: DiaryWindowFilter,
	now: number,
): DiaryEntry[] {
	if (kind !== 'all') return [];
	const start = windowStart(window, now);
	if (start === null) return entries;
	return entries.filter((entry) => {
		const startedAt = Date.parse(`${entry.date}T00:00:00`);
		return Number.isNaN(startedAt) || startedAt >= start;
	});
}
