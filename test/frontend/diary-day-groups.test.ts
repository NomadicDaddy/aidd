import { describe, expect, test } from 'bun:test';

import type { DiaryEntry, DiaryTimelineItem } from '../../frontend/src/api/types.ts';

import {
	filterDiaryEntries,
	filterTimelineItems,
	windowStart,
} from '../../frontend/src/pages/diary/diaryFilters.ts';
import {
	dayKeyFromMs,
	dayLabelForKey,
	groupDiaryByDay,
	hasEntryForDay,
	timelineItemTone,
} from '../../frontend/src/pages/diary/diaryItems.ts';

function entry(date: string, projectName: string): DiaryEntry {
	return {
		bodyMd: '# x',
		date,
		fileMtimeMs: Date.parse(`${date}T12:00:00Z`),
		generatedBy: null,
		id: `${date}|${projectName}`,
		phase: null,
		projectId: projectName,
		projectName,
		projectPath: `d:/applications/${projectName}`,
		summary: null,
		title: `${projectName} ${date}`,
	};
}

function item(id: string, startedAt: number): DiaryTimelineItem {
	return {
		completedAt: null,
		detail: null,
		durationMs: null,
		id,
		kind: 'run',
		mode: 'coding',
		projectName: 'demo',
		projectPath: 'd:/applications/demo',
		runOutcome: {
			exitCode: 0,
			status: 'completed',
			stopReason: 'completed',
			summary: 'Run completed',
		},
		startedAt,
		status: 'completed',
		title: id,
	};
}

function msFor(date: string, hour: number): number {
	return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime();
}

describe('groupDiaryByDay', () => {
	test('buckets entries and items by local day, newest first', () => {
		const groups = groupDiaryByDay(
			[entry('2026-06-11', 'demo'), entry('2026-06-12', 'demo')],
			[item('run_old', msFor('2026-06-11', 9)), item('run_new', msFor('2026-06-12', 9))],
		);
		expect(groups.map((group) => group.key)).toEqual(['2026-06-12', '2026-06-11']);
		expect(groups[0]?.entries[0]?.date).toBe('2026-06-12');
		expect(groups[0]?.items[0]?.id).toBe('run_new');
	});

	test('places an entry and the same day’s activity in one group', () => {
		const groups = groupDiaryByDay(
			[entry('2026-06-12', 'demo')],
			[item('run_a', msFor('2026-06-12', 10))],
		);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.entries).toHaveLength(1);
		expect(groups[0]?.items).toHaveLength(1);
	});

	test('sorts entries within a day by project name', () => {
		const groups = groupDiaryByDay(
			[entry('2026-06-12', 'zed'), entry('2026-06-12', 'alpha')],
			[],
		);
		expect(groups[0]?.entries.map((e) => e.projectName)).toEqual(['alpha', 'zed']);
	});

	test('hasEntryForDay detects an existing same-day entry', () => {
		const entries = [entry('2026-06-12', 'demo'), entry('2026-06-11', 'demo')];
		expect(hasEntryForDay(entries, '2026-06-12')).toBe(true);
		expect(hasEntryForDay(entries, '2026-06-13')).toBe(false);
		expect(hasEntryForDay([], '2026-06-12')).toBe(false);
	});

	test('dayKeyFromMs yields the local calendar day for a timestamp', () => {
		expect(dayKeyFromMs(msFor('2026-06-12', 10))).toBe('2026-06-12');
		expect(dayKeyFromMs(msFor('2026-06-09', 23))).toBe('2026-06-09');
	});

	test('colors the status badge by run status', () => {
		expect(timelineItemTone({ ...item('r', 1), status: 'completed' })).toBe('emerald');
		expect(timelineItemTone({ ...item('r', 1), status: 'failed' })).toBe('red');
	});
});

describe('dayLabelForKey', () => {
	test('names the two most recent days relatively', () => {
		expect(dayLabelForKey('2026-06-12', '2026-06-12')).toBe('Today');
		expect(dayLabelForKey('2026-06-11', '2026-06-12')).toBe('Yesterday');
	});

	test('crosses a month boundary when resolving yesterday', () => {
		expect(dayLabelForKey('2026-05-31', '2026-06-01')).toBe('Yesterday');
	});

	test('formats older days without the full weekday-and-year string', () => {
		const label = dayLabelForKey('2026-06-01', '2026-06-12');
		expect(label).not.toBe('2026-06-01');
		expect(label.toUpperCase()).not.toContain('MONDAY');
		expect(label.length).toBeLessThan('Monday, June 1, 2026'.length);
	});

	test('groupDiaryByDay labels its buckets against the supplied clock', () => {
		const groups = groupDiaryByDay(
			[],
			[item('run_a', msFor('2026-06-12', 9)), item('run_b', msFor('2026-06-11', 9))],
			msFor('2026-06-12', 18),
		);
		expect(groups.map((group) => group.label)).toEqual(['Today', 'Yesterday']);
	});
});

describe('diary filters', () => {
	const now = msFor('2026-06-12', 12);
	const items = [
		{ ...item('run_today', msFor('2026-06-12', 9)) },
		{ ...item('skill_recent', msFor('2026-06-02', 9)), kind: 'skill' as const },
		{ ...item('release_old', msFor('2026-04-01', 9)), kind: 'release' as const },
	];

	test('all/all is a pass-through', () => {
		expect(filterTimelineItems(items, 'all', 'all', now)).toHaveLength(3);
	});

	test('narrows to one kind', () => {
		expect(filterTimelineItems(items, 'release', 'all', now).map((i) => i.id)).toEqual([
			'release_old',
		]);
	});

	test('narrows to a time window', () => {
		expect(filterTimelineItems(items, 'all', '7d', now).map((i) => i.id)).toEqual([
			'run_today',
		]);
		expect(filterTimelineItems(items, 'all', '30d', now).map((i) => i.id)).toEqual([
			'run_today',
			'skill_recent',
		]);
	});

	test('combines both controls', () => {
		expect(filterTimelineItems(items, 'skill', '30d', now).map((i) => i.id)).toEqual([
			'skill_recent',
		]);
		expect(filterTimelineItems(items, 'skill', '7d', now)).toHaveLength(0);
	});

	test('windowStart is unbounded only for "all"', () => {
		expect(windowStart('all', now)).toBeNull();
		expect(windowStart('7d', now)).toBe(now - 7 * 24 * 60 * 60 * 1000);
	});

	test('lets narrative entries be selected as their own kind', () => {
		const entries = [entry('2026-06-12', 'demo'), entry('2026-04-01', 'demo')];
		expect(filterDiaryEntries(entries, 'all', 'all', now)).toHaveLength(2);
		expect(filterDiaryEntries(entries, 'entry', 'all', now)).toHaveLength(2);
		expect(filterDiaryEntries(entries, 'all', '7d', now).map((e) => e.date)).toEqual([
			'2026-06-12',
		]);
		expect(filterDiaryEntries(entries, 'run', 'all', now)).toHaveLength(0);
		expect(filterTimelineItems(items, 'entry', 'all', now)).toHaveLength(0);
	});
});
