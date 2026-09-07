import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { DiaryTimelineItem } from '../../frontend/src/api/types.ts';

import { groupDiaryByDay } from '../../frontend/src/pages/diary/diaryItems.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderTimeline(items: DiaryTimelineItem[]): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DiaryTimelineGrid, DiaryTimelineList } from './src/pages/diary/DiaryTimelineList.tsx';",
		"import { PageRail } from './src/components/shared/PageRail.tsx';",
		`const items = ${JSON.stringify(items)};`,
		'const timeline = createElement(DiaryTimelineList, { items, showProject: true });',
		"const list = createElement(DiaryTimelineGrid, { kindFilter: 'all', showProject: true }, timeline);",
		"const page = createElement(PageRail, { rail: 'full' }, list);",
		'console.log(JSON.stringify(renderToStaticMarkup(createElement(MemoryRouter, null, page))));',
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

function timelineItem(overrides: Partial<DiaryTimelineItem>): DiaryTimelineItem {
	return {
		completedAt: null,
		detail: null,
		durationMs: null,
		id: 'run_a',
		kind: 'run',
		mode: 'coding',
		projectName: 'starsync',
		projectPath: 'd:/applications/starsync',
		runOutcome: {
			exitCode: 0,
			status: 'completed',
			stopReason: 'completed',
			summary: 'Run completed',
		},
		startedAt: Date.UTC(2026, 5, 12, 9, 30),
		status: 'completed',
		title: 'Coding run',
		...overrides,
	};
}

describe('diary timeline rows', () => {
	test('renders one card surface with hairline separators instead of per-row outlines', () => {
		const html = renderTimeline([timelineItem({}), timelineItem({ id: 'run_b' })]);

		expect(html).toContain('divide-y divide-border');
		expect(html).not.toContain('rounded-md border border-border');
		expect(html.match(/<li /g)).toHaveLength(2);
		expect(html.match(/<ul /g)).toHaveLength(1);
	});

	test('pins the stamp to a fixed column so it cannot wrap under the detail block', () => {
		const html = renderTimeline([
			timelineItem({ detail: 'A long agent-written narrative summary of what happened.' }),
		]);

		// The stamp is still pinned to its own auto track; that track moved up to the list when
		// the rows became subgrids of it, so every row's stamp now lands on one shared rail.
		expect(html).toContain('grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-5');
		expect(html).toContain('col-span-full grid grid-cols-subgrid items-start');
		expect(html).toContain('class="mr-auto w-full max-w-none" data-content-rail="full"');
		expect(html).toContain('@container');
		expect(html).toContain('col-span-full grid grid-cols-subgrid gap-x-2 overflow-hidden p-0');
		expect(html).toContain('shrink-0 text-xs text-muted-foreground tabular-nums');

		// The provider carries the measure so the grid, hover band, separators, and border stop together.
		expect(html).toContain('<li class="relative isolate px-3 py-2');
	});

	test('renders the exact start time as a machine-readable element, not a title-only tooltip', () => {
		const html = renderTimeline([timelineItem({})]);

		// Case-insensitive: the server renderer emits the JSX prop name verbatim, and HTML
		// attribute names are case-insensitive.
		expect(html).toMatch(/<time[^>]*datetime="2026-06-12T09:30:00\.000Z"/i);
		expect(html).not.toContain('ago<');
	});

	test('gives narrative detail the row width below the metadata chips', () => {
		const html = renderTimeline([
			timelineItem({ detail: 'The run rewrote the importer and left two tests failing.' }),
		]);

		expect(html).toContain('relative z-10 mt-1 items-end gap-2');
		expect(html).toContain('line-clamp-2');
		// Narrative detail keeps the prose measure even while the row and clamp own its placement.
		expect(html).toContain('max-w-[46ch]');
		expect(html).not.toContain('[&amp;&gt;p]:max-w-none');
		expect(html).toContain('text-muted-foreground');
		expect(html).toContain('The run rewrote the importer');
		// Project, mode and duration stay chips; only the prose is promoted.
		expect(html).toContain('starsync');
		expect(html).toContain('coding');
	});

	test('suppresses the status badge on releases, whose status never varies', () => {
		const release = renderTimeline([
			timelineItem({
				id: 'rel',
				kind: 'release',
				mode: null,
				projectPath: null,
				runOutcome: null,
				title: 'v3.0.0',
			}),
		]);
		const run = renderTimeline([timelineItem({})]);

		expect(release).toContain('Release');
		expect(release).not.toContain('completed');
		expect(run).toContain('completed');
	});

	test('renders same-day releases in the sequence supplied by the timeline service', () => {
		const items = [
			timelineItem({ id: 'release:2026-06-12:0', kind: 'release', title: 'First' }),
			timelineItem({ id: 'release:2026-06-12:1', kind: 'release', title: 'Second' }),
			timelineItem({ id: 'release:2026-06-12:11', kind: 'release', title: 'Twelfth' }),
		];
		const group = groupDiaryByDay([], items, items[0]?.startedAt)[0];
		const html = renderTimeline(group?.items ?? []);

		expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
		expect(html.indexOf('Second')).toBeLessThan(html.indexOf('Twelfth'));
	});

	test('derives run labels from the shared outcome classifier instead of raw status', () => {
		const noWork = renderTimeline([
			timelineItem({
				runOutcome: {
					exitCode: 0,
					status: 'completed',
					stopReason: 'no_work',
					summary: 'No approved incomplete coding features are available',
				},
			}),
		]);
		const completed = renderTimeline([timelineItem({})]);
		const finalCheckWarning = renderTimeline([
			timelineItem({
				runOutcome: {
					exitCode: 0,
					status: 'completed',
					stopReason: 'blocked',
					summary: 'completion_marker_missing_or_unaccepted',
				},
			}),
		]);

		expect(noWork).toContain('No work');
		expect(noWork).not.toContain('>completed<');
		expect(completed).toContain('Completed');
		expect(finalCheckWarning).toContain('Completed · warnings');
	});
});

describe('diary feed chrome', () => {
	test('anchors each day with a sticky section heading that outranks its rows', async () => {
		const feed = await readFile(
			resolve(FRONTEND_ROOT, 'src/pages/diary/DiaryFeed.tsx'),
			'utf8',
		);

		// The offset, not a bare `top-0`: below `sm` the shell nav bar occupies that strip and
		// paints over it. Enforced generally in sticky-heading-offset.test.ts.
		expect(feed).toContain('sticky top-[var(--app-topbar-height,0px)] z-10');
		expect(feed).toContain('border-t border-border');
		// Outranking its rows is a matter of a different step, not a heavier weight at the same one:
		// at `text-sm font-semibold text-foreground` the heading and the entry titles it governs
		// were both 14px foreground and differed only by weight. It takes the shared caption now.
		expect(feed).toContain('sectionCaptionClass');
		expect(feed).not.toContain('text-sm font-semibold text-foreground');
	});

	test('fills the shell and pages it with one control', async () => {
		const feed = await readFile(
			resolve(FRONTEND_ROOT, 'src/pages/diary/DiaryFeed.tsx'),
			'utf8',
		);
		const page = await readFile(
			resolve(FRONTEND_ROOT, 'src/pages/diary/DiaryPage.tsx'),
			'utf8',
		);

		// The old centered 5xl cap is gone. The feed uses the standard 80rem data rail so repeated
		// timeline rows stay scannable without turning the route back into a narrow prose column.
		expect(page).toContain('page-reveal space-y-5');
		expect(page).not.toContain('max-w-5xl');
		expect(feed).not.toContain('max-w-5xl');
		expect(feed).toContain('<div className="page-reveal max-w-[80rem] space-y-5">');
		expect(feed).toContain('border-t border-border');
		expect(feed).not.toContain('contentRailClass');
		expect(feed).toContain('filterReset="toolbar"');
		// "More entries" and "More activity" each paged half of what the one counter above them
		// counted. One feed, one count, one pager. Matched on the string literals, since the
		// comment in the source names the two labels it replaced.
		expect(feed).toContain("'Load more'");
		expect(feed).toContain('if (entriesQuery.hasNextPage) void entriesQuery.fetchNextPage();');
		expect(feed).toContain(
			'if (timelineQuery.hasNextPage) void timelineQuery.fetchNextPage();',
		);
		expect(feed).not.toContain("'More activity'");
		expect(feed).not.toContain("'More entries'");
	});

	test('offers kind and time-window scope with a count of what is shown', async () => {
		const bar = await readFile(
			resolve(FRONTEND_ROOT, 'src/pages/diary/DiaryFilterBar.tsx'),
			'utf8',
		);

		expect(bar).toContain('ariaLabel="Event kind"');
		expect(bar).toContain('ariaLabel="Time window"');
		expect(bar).toContain('filtered={shown}');
		expect(bar).toContain('total={total}');
	});

	test('keeps the diary off raw palette colours', async () => {
		const sources = await Promise.all(
			[
				'DiaryEntryCard.tsx',
				'DiaryFeed.tsx',
				'DiaryFilterBar.tsx',
				'DiaryTimelineList.tsx',
			].map((file) => readFile(resolve(FRONTEND_ROOT, 'src/pages/diary', file), 'utf8')),
		);

		for (const source of sources) {
			expect(source).not.toMatch(/text-(?:neutral|teal|slate)-\d/);
			expect(source).not.toMatch(/border-(?:neutral|teal|slate)-\d/);
		}
	});
});
