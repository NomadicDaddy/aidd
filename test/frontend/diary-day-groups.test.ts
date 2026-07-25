import { describe, expect, test } from 'bun:test';

import type { DiaryEntry, DiaryTimelineItem } from '../../frontend/src/api/types.ts';

import {
	dayKeyFromMs,
	groupDiaryByDay,
	hasEntryForDay,
	timelineItemTone,
} from '../../frontend/src/pages/diary/diaryItems.ts';

function entry(date: string, projectName: string): DiaryEntry {
	return {
		bodyMd: '# x',
		date,
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

	test('releases keep their kind tone; runs color by status', () => {
		expect(timelineItemTone({ ...item('r', 1), kind: 'release', status: 'completed' })).toBe(
			'emerald',
		);
		expect(timelineItemTone({ ...item('r', 1), status: 'failed' })).toBe('red');
	});
});
