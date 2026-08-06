import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { DiaryTimelineItem } from '../../frontend/src/api/types.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderTimeline(items: DiaryTimelineItem[]): string {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { DiaryTimelineList } from './src/pages/diary/DiaryTimelineList.tsx';",
		`const items = ${JSON.stringify(items)};`,
		'const list = createElement(DiaryTimelineList, { items, showProject: true });',
		'console.log(JSON.stringify(renderToStaticMarkup(createElement(MemoryRouter, null, list))));',
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

		expect(html).toContain('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2');
		expect(html).toContain('shrink-0 text-xs text-muted-foreground tabular-nums');
	});

	test('renders the exact start time as a machine-readable element, not a title-only tooltip', () => {
		const html = renderTimeline([timelineItem({})]);

		// Case-insensitive: the server renderer emits the JSX prop name verbatim, and HTML
		// attribute names are case-insensitive.
		expect(html).toMatch(/<time[^>]*datetime="2026-06-12T09:30:00\.000Z"/i);
		expect(html).not.toContain('ago<');
	});

	test('gives narrative detail its own capped measure below the metadata chips', () => {
		const html = renderTimeline([
			timelineItem({ detail: 'The run rewrote the importer and left two tests failing.' }),
		]);

		expect(html).toContain('mt-1 max-w-[68ch] text-sm text-muted-foreground');
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
				title: 'v2.137.0',
			}),
		]);
		const run = renderTimeline([timelineItem({})]);

		expect(release).toContain('Release');
		expect(release).not.toContain('completed');
		expect(run).toContain('completed');
	});
});

describe('diary feed chrome', () => {
	test('anchors each day with a sticky section heading that outranks its rows', async () => {
		const feed = await readFile(
			resolve(FRONTEND_ROOT, 'src/pages/diary/DiaryFeed.tsx'),
			'utf8',
		);

		expect(feed).toContain('sticky top-0 z-10');
		expect(feed).toContain('border-t border-border');
		// Outranking its rows is a matter of a different step, not a heavier weight at the same one:
		// at `text-sm font-semibold text-foreground` the heading and the entry titles it governs
		// were both 14px foreground and differed only by weight. It takes the shared caption now.
		expect(feed).toContain('sectionCaptionClass');
		expect(feed).not.toContain('text-sm font-semibold text-foreground');
	});

	test('constrains the feed to a reading column and pages it with one control', async () => {
		const feed = await readFile(
			resolve(FRONTEND_ROOT, 'src/pages/diary/DiaryFeed.tsx'),
			'utf8',
		);

		expect(feed).toContain('max-w-5xl');
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
		expect(bar).toContain('Showing {shown} of {total} loaded');
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
