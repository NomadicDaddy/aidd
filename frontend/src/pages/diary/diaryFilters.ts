import type { DiaryEntry, DiaryTimelineItem, DiaryTimelineKind } from '../../api/types.ts';
import type { FilterRegister } from '../../lib/filterFields.ts';

import { filterRegister } from '../../lib/filterFields.ts';

export type DiaryKindFilter = 'all' | 'entry' | DiaryTimelineKind;
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
			kind !== 'entry' &&
			(kind === 'all' || item.kind === kind) &&
			(start === null || item.startedAt >= start),
	);
}

/** Narrative entries appear for the combined feed or their explicit Entries filter. */
export function filterDiaryEntries(
	entries: DiaryEntry[],
	kind: DiaryKindFilter,
	window: DiaryWindowFilter,
	now: number,
): DiaryEntry[] {
	if (kind !== 'all' && kind !== 'entry') return [];
	const start = windowStart(window, now);
	if (start === null) return entries;
	return entries.filter((entry) => {
		const startedAt = Date.parse(`${entry.date}T00:00:00`);
		return Number.isNaN(startedAt) || startedAt >= start;
	});
}

/** Control order for the kind filter. The labels are keyed separately so they can sort themselves. */
export const DIARY_KINDS: readonly DiaryKindFilter[] = [
	'all',
	'entry',
	'run',
	'skill',
	'recipe-session',
	'director-cycle',
	'release',
];

export const diaryKindLabels: Record<DiaryKindFilter, string> = {
	all: 'All',
	'director-cycle': 'Director',
	entry: 'Entries',
	'recipe-session': 'Recipes',
	release: 'Releases',
	run: 'Runs',
	skill: 'Skills',
};

/**
 * What a window means in prose. The segmented control abbreviates to `7d`, which is right above a
 * feed and wrong in a sentence, so the control takes these as its `title` and the empty state's
 * filter readout takes them as the value.
 */
export const diaryWindowLabels: Record<DiaryWindowFilter, string> = {
	'30d': 'Last 30 days',
	'7d': 'Last 7 days',
	all: 'Everything loaded',
};

/**
 * The filtered-to-nothing register for the feed, beside the predicates that emptied it.
 *
 * Window is the diary's own axis and is not in `FILTER_FIELD_ORDER`, so it sorts last in the
 * readout — which is also where its control sits, to the right of kind.
 */
export function diaryFilterRegister(
	kind: DiaryKindFilter,
	window: DiaryWindowFilter,
	onReset: () => void,
): FilterRegister | undefined {
	return filterRegister(onReset, [
		kind !== 'all' && { label: 'Kind', value: diaryKindLabels[kind] },
		window !== 'all' && { label: 'Window', value: diaryWindowLabels[window] },
	]);
}
