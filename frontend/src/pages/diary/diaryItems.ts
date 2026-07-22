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

const KIND_TONES: Record<DiaryTimelineKind, Tone> = {
	'director-cycle': 'amber',
	'recipe-session': 'cyan',
	release: 'emerald',
	run: 'neutral',
	skill: 'cyan',
};

export function timelineKindLabel(kind: DiaryTimelineKind): string {
	return KIND_LABELS[kind];
}

// Releases are point-in-time markers, not lifecycle events, so they take the kind tone directly;
// everything else colors by run/session status (reusing the Runs/History tone mapping).
export function timelineItemTone(item: DiaryTimelineItem): Tone {
	if (item.kind === 'release') return KIND_TONES.release;
	return runStatusTone(item.status);
}

export function timelineKindTone(kind: DiaryTimelineKind): Tone {
	return KIND_TONES[kind];
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

function labelForKey(key: string): string {
	const parsed = Date.parse(`${key}T00:00:00`);
	if (Number.isNaN(parsed)) return key;
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(parsed);
}

// Interleave narrative entries and timeline activity into day buckets, newest day first. Within a
// day, entries sort by project name and timeline items by recency. Days are keyed by local
// calendar date so an entry (dated YYYY-MM-DD) and the runs from that day land together.
export function groupDiaryByDay(
	entries: DiaryEntry[],
	items: DiaryTimelineItem[]
): DiaryDayGroup[] {
	const groups = new Map<string, DiaryDayGroup>();

	const ensure = (key: string): DiaryDayGroup => {
		const existing = groups.get(key);
		if (existing) return existing;
		const created: DiaryDayGroup = { entries: [], items: [], key, label: labelForKey(key) };
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
