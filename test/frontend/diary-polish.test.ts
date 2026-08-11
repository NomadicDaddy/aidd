import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { DiaryTimelineItem } from '../../frontend/src/api/types.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

/**
 * `remediation-20260805-polish-diary`, spec items 1-7.
 *
 * Each test states the finding it closes, so a later change that reopens one fails against the
 * reason rather than against a class string nobody can place.
 */
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
		durationMs: 10_258_000,
		id: 'run_a',
		kind: 'run',
		mode: 'coding',
		projectName: 'aidd',
		projectPath: 'd:/applications/aidd',
		startedAt: Date.UTC(2026, 5, 12, 9, 30),
		status: 'completed',
		// The shape the backend actually composes for a run row.
		title: 'coding · aidd',
		...overrides,
	};
}

const release = timelineItem({
	durationMs: null,
	id: 'release:2026-06-12:0',
	kind: 'release',
	mode: null,
	projectPath: null,
	startedAt: Date.parse('2026-06-12T00:00:00'),
	title: 'v2.137.0',
});

describe('diary polish', () => {
	test('states the mode and the project once, not twice', () => {
		const html = renderTimeline([timelineItem({})]);

		// The title read "coding · aidd" and the meta line directly under it read "aidd coding
		// 2h 50m" — the same two facts, on two lines, in two treatments. Counted on the rendered
		// text: the link's accessible name restates the title on purpose, and it is not read twice.
		const text = html.replaceAll(/<[^>]*>/gu, '|');
		expect(text.match(/coding/gu)).toHaveLength(1);
		expect(text.match(/aidd/gu)).toHaveLength(1);
		// The duration is the one fact the title does not carry, so it is the one that survives.
		expect(text).toContain('2h 50m');
		// The dedupe left the project name stated once, in the title — and the title set it in
		// Geist Sans while the recipe row directly under it printed the same identifier as a mono
		// chip. The one place it is stated sets it as the machine string it is.
		expect(html).toContain('<span class="font-mono">aidd</span>');
	});

	test('draws no stamp for a record that carries no clock', () => {
		const html = renderTimeline([release]);

		// A release is parsed from a `## [YYYY-MM-DD]` heading. Local midnight is how the date
		// became sortable, not a time anyone recorded, and "12:00 AM" on thirteen rows said it was.
		expect(html).not.toContain('<time');
		expect(html).not.toContain('12:00');
		// The row still carries its own fact — the project — beside the title, on one line.
		expect(html).toContain('v2.137.0');
	});

	test('says a row leads somewhere before it is hovered, and takes the whole row', () => {
		const linked = renderTimeline([timelineItem({})]);
		const plain = renderTimeline([release]);

		// The only affordance was the title's colour changing under the pointer, which is nothing
		// to a reader who is not already pointing at it. The underline that replaced it was
		// `decoration-border` — 1.23:1 against the row, so the 36 navigable rows and the 34 inert
		// ones still looked the same at rest. The accent is what marks a link here, as it does on
		// the Dashboard's feature rows and on the entry cards of this same page.
		expect(linked).toContain('font-medium text-accent');
		expect(linked).toContain('hover:underline');
		expect(linked).not.toContain('decoration-border');
		expect(plain).not.toContain('text-accent');
		expect(linked).toContain('after:absolute after:inset-0');
		// The overlay is what receives focus, so the ring belongs to the row around it.
		expect(linked).toContain('focus-within:ring-2');
		expect(plain).not.toContain('focus-within:ring-2');
		expect(plain).not.toContain('after:absolute');
	});

	test('gives every link in the feed an accessible name of its own', () => {
		const html = renderTimeline([
			timelineItem({ id: 'run_a' }),
			timelineItem({ id: 'run_b', startedAt: Date.UTC(2026, 5, 12, 14, 5) }),
		]);
		const labels = [...html.matchAll(/aria-label="([^"]+)"/gu)].map((match) => match[1]);

		// Two runs in one project on one day link to the same filtered Runs view under the same
		// visible text: a screen reader's link list held nine entries reading "coding · aidd".
		expect(labels).toHaveLength(2);
		expect(new Set(labels).size).toBe(2);
		// The visible title still leads the name, so a speech user can say what they can see.
		for (const label of labels) expect(label?.startsWith('coding · aidd')).toBe(true);
	});

	test('separates the meta parts and sets each in the face its content asks for', () => {
		const html = renderTimeline([timelineItem({ title: 'Nightly audit' })]);

		// Three classes of value rendered as identical muted spans with an 8px gap and nothing
		// between them: a directory, a mode, and an elapsed time.
		expect(html).toContain('<span class="font-mono">aidd</span>');
		expect(html).toContain('<span class="tabular-nums">2h 50m</span>');
		// The separator sits at the weight of the values it divides. `text-border` is 1.23:1
		// against the row and did not render at all, so the line read as three gap-separated spans
		// — the ambiguity the separator was added to remove, still there behind a glyph nobody
		// could see.
		expect(html.match(/aria-hidden="true" class="text-muted-foreground"/gu)).toHaveLength(3);
		expect(html).not.toContain('class="text-border"');
	});

	test('puts the day heading and the row titles on different type steps', async () => {
		const feed = await readFile(
			resolve(FRONTEND_ROOT, 'src/pages/diary/DiaryFeed.tsx'),
			'utf8',
		);

		// Both were 14px `text-foreground` and differed only by font weight, so the grouping level
		// and the content level occupied the same step.
		expect(feed).toContain('sectionCaptionClass');
		expect(feed).not.toContain('text-sm font-semibold text-foreground');
	});

	test('pages the feed with the same scope the counter reports', async () => {
		const feed = await readFile(
			resolve(FRONTEND_ROOT, 'src/pages/diary/DiaryFeed.tsx'),
			'utf8',
		);
		const bar = await readFile(
			resolve(FRONTEND_ROOT, 'src/pages/diary/DiaryFilterBar.tsx'),
			'utf8',
		);

		// "Showing 1 of 70 loaded" counted both halves of the feed; the two buttons beside it paged
		// one half each. Matched on the string literals, since the source comment names the labels.
		expect(bar).toContain('Showing {shown} of {total} loaded');
		expect(feed).toContain("'Load more'");
		expect(feed).not.toContain("'More activity'");
		expect(feed).not.toContain("'More entries'");
	});
});
