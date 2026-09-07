import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { DiaryTimelineItem } from '../../frontend/src/api/types.ts';

import {
	diaryTimelineColumns,
	diaryTimelineGridColumns,
} from '../../frontend/src/pages/diary/diaryTimelineColumns.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const source = (path: string) => readFile(resolve(FRONTEND_ROOT, 'src', path), 'utf8');

function renderTimelineGroups(groups: DiaryTimelineItem[][]): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DiaryTimelineGrid, DiaryTimelineList } from './src/pages/diary/DiaryTimelineList.tsx';",
		`const groups = ${JSON.stringify(groups)};`,
		'const lists = groups.map((items, index) => createElement(DiaryTimelineList, { items, key: index, showProject: true }));',
		"const grid = createElement(DiaryTimelineGrid, { kindFilter: 'all', showProject: true }, lists);",
		'console.log(JSON.stringify(renderToStaticMarkup(createElement(MemoryRouter, null, grid))));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as string;
}

function renderTimeline(items: DiaryTimelineItem[]): string {
	return renderTimelineGroups([items]);
}

function runRow(id: string, stopReason: string, startedAt: number): DiaryTimelineItem {
	return {
		completedAt: null,
		detail: null,
		durationMs: null,
		id,
		kind: 'run',
		mode: 'coding',
		projectName: 'starsync',
		projectPath: 'd:/applications/starsync',
		runOutcome: { exitCode: 0, status: 'completed', stopReason, summary: null },
		startedAt,
		status: 'completed',
		title: 'Coding run',
	} as DiaryTimelineItem;
}

/**
 * The widest status labels the corpus can actually produce, taken from `classifyWebRun` rather
 * than from what happened to be on screen. This is the point of the record: the fixed `6rem`
 * status track fit the labels the reviewer saw and not the ones the classifier composes.
 */
const WIDE_ROWS = [
	runRow('run_parked', 'metadata_conflict_parked', Date.UTC(2026, 5, 12, 9, 30)),
	runRow('run_reaped', 'heartbeat_stale', Date.UTC(2026, 5, 12, 9, 20)),
	runRow('run_clean', 'completed', Date.UTC(2026, 5, 12, 9, 10)),
];

describe('diary badge tracks', () => {
	test('the feed owns one grid and every day list shares its tracks', () => {
		const html = renderTimelineGroups([WIDE_ROWS.slice(0, 1), WIDE_ROWS.slice(1)]);

		// One outer grid, two day cards, and three rows sharing its track lines. Per-day grids
		// resolved content-sized tracks independently and started titles at different x values.
		expect(html.match(/<ul /gu)).toHaveLength(2);
		expect(html).toContain('@min-[45rem]:grid-cols-(--diary-grid-columns)');
		expect(html).toContain(
			'--diary-grid-columns:minmax(4rem,max-content) minmax(6rem,max-content) 12rem minmax(0,1fr) auto',
		);
		const lists = html.match(/<ul class="[^"]*"/gu) ?? [];
		for (const list of lists) {
			expect(list).toContain('grid-cols-subgrid');
			expect(list).toContain('col-span-full');
		}
		const rows = html.match(/<li class="[^"]*"/gu) ?? [];
		expect(rows).toHaveLength(3);
		for (const row of rows) {
			expect(row).toContain('grid-cols-subgrid');
			expect(row).toContain('col-span-full');
		}
	});

	test('no label length can paint outside its track', () => {
		const html = renderTimeline(WIDE_ROWS);

		// The labels are here, so the track has to hold them; the classifier composes these and
		// the widest is 25 characters against a track that used to stop at 6rem.
		expect(html).toContain('Parked: metadata conflict');
		expect(html).toContain('Reaped: stale heartbeat');

		// The cell no longer declares a width of its own. That was the mechanism: a `w-24` span
		// held its 96px while the inline-flex badge inside it grew straight out over the next
		// column, because `Badge` never clips.
		expect(html).not.toContain('w-16 shrink-0');
		expect(html).not.toContain('w-24 shrink-0');
	});

	test('widening the fixed tracks is not available as a fix', async () => {
		const timeline = await source('pages/diary/DiaryTimelineList.tsx');

		// Every branch that renders a badge column sizes that column to its content. A fixed
		// `4rem`/`6rem` track only moves the threshold to the next longer label, and the label
		// set is open — `classifyWebRun` builds its strings at runtime.
		expect(timeline).not.toContain('grid-cols-[4rem_');
		expect(timeline).not.toContain('_6rem_');
		expect(timeline).not.toContain('grid-cols-[6rem_');
		const columnModel = await source('pages/diary/diaryTimelineColumns.ts');
		const badgeTracks = columnModel.match(/minmax\((?:4|6)rem,max-content\)/gu) ?? [];
		expect(badgeTracks).toHaveLength(2);
	});

	test('one column model keeps every filter template aligned with its row cells', () => {
		for (const kind of [
			'all',
			'entry',
			'director-cycle',
			'recipe-session',
			'release',
			'run',
			'skill',
		] as const) {
			for (const showProject of [false, true]) {
				const columns = diaryTimelineColumns(kind, showProject);
				const enabled =
					Number(columns.kind) + Number(columns.status) + Number(columns.project);
				expect(diaryTimelineGridColumns(columns).split(' ')).toHaveLength(enabled + 2);
			}
		}
	});

	test('the badge is still the thing that measures, not the thing that is clipped', async () => {
		const badge = await source('components/ui/badge.tsx');

		// Clipping the badge was the alternative and it is the wrong one: the label is the whole
		// content of the chip, so an ellipsis there says nothing. `Badge` keeps its intrinsic
		// width and the container is what has to respect it.
		expect(badge).toContain('whitespace-nowrap');
		expect(badge).not.toContain('overflow-hidden');
		expect(badge).not.toContain('truncate');
	});
});
