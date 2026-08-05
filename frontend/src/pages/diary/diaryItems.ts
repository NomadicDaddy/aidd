import type { DiaryEntry, DiaryTimelineItem, DiaryTimelineKind } from '../../api/types.ts';
import type { Tone } from '../../lib/tones.ts';

import { runStatusTone } from '../projects/detail/shared.ts';

export interface DiaryDayGroup {
	entries: DiaryEntry[];
	items: DiaryTimelineItem[];
	key: string;
	label: string;
}

const KIND_LABELS: Record<DiaryTimelineKind, string> = {
	'director-cycle': 'Director',
	'recipe-session': 'Recipe',
	release: 'Release',
	run: 'Run',
	skill: 'Skill',
};

export function timelineKindLabel(kind: DiaryTimelineKind): string {
	return KIND_LABELS[kind];
}

// Each timeline row shows a kind badge beside a status badge. Only the status badge is allowed a
// tone: kind is taxonomy, and coloring it made a healthy Director cycle render amber next to its
// own green status. The kind badge renders neutral (see DiaryTimelineList) and is told apart by its
// label, which leaves tone meaning exactly one thing per row.
//
// Releases are point-in-time markers rather than lifecycle events — their status is the literal
// string "completed" on every row — so DiaryTimelineList renders no status badge for them at all.
// Everything else colors by run/session status, reusing the Runs/History tone mapping.
export function timelineItemTone(item: DiaryTimelineItem): Tone {
	return runStatusTone(item.status);
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

export function dayKeyFromMs(ms: number): string {
	const date = new Date(ms);
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// True when a narrative entry already exists for the given local calendar day. The diary is one
// entry per day with same-day overwrite, so the "Write today's entry" action regenerates an
// existing day rather than appending — the tab uses this to label the action accordingly.
export function hasEntryForDay(entries: DiaryEntry[], dayKey: string): boolean {
	return entries.some((entry) => entry.date === dayKey);
}

function shiftDayKey(key: string, days: number): string {
	const parsed = Date.parse(`${key}T00:00:00`);
	if (Number.isNaN(parsed)) return key;
	return dayKeyFromMs(parsed + days * 24 * 60 * 60 * 1000);
}

/**
 * Day headings are the feed's only structural divider, so they are named the way a reader thinks
 * about the last two days. `dateStyle: 'full'` produced "TUESDAY, AUGUST 4, 2026" for a repeating
 * rail element; `medium` keeps the heading short enough to stay legible while sticky.
 */
export function dayLabelForKey(key: string, todayKey: string): string {
	if (key === todayKey) return 'Today';
	if (key === shiftDayKey(todayKey, -1)) return 'Yesterday';
	const parsed = Date.parse(`${key}T00:00:00`);
	if (Number.isNaN(parsed)) return key;
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed);
}

// Interleave narrative entries and timeline activity into day buckets, newest day first. Within a
// day, entries sort by project name and timeline items by recency. Days are keyed by local
// calendar date so an entry (dated YYYY-MM-DD) and the runs from that day land together.
export function groupDiaryByDay(
	entries: DiaryEntry[],
	items: DiaryTimelineItem[],
	now: number = Date.now(),
): DiaryDayGroup[] {
	const groups = new Map<string, DiaryDayGroup>();
	const todayKey = dayKeyFromMs(now);

	const ensure = (key: string): DiaryDayGroup => {
		const existing = groups.get(key);
		if (existing) return existing;
		const created: DiaryDayGroup = {
			entries: [],
			items: [],
			key,
			label: dayLabelForKey(key, todayKey),
		};
		groups.set(key, created);
		return created;
	};

	for (const entry of entries) ensure(entry.date).entries.push(entry);
	for (const item of items) ensure(dayKeyFromMs(item.startedAt)).items.push(item);

	const ordered = [...groups.values()].sort((left, right) => (left.key < right.key ? 1 : -1));
	for (const group of ordered) {
		group.entries.sort((left, right) => left.projectName.localeCompare(right.projectName));
		group.items.sort((left, right) => right.startedAt - left.startedAt);
	}
	return ordered;
}
