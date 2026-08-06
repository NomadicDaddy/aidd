import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dir, '../../frontend/src');
const TABS = join(SRC, 'pages/audits/tabs');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(...segments)).text();
}

/**
 * The three audits tabs each render a long table, and two of them already had the shape: bound the
 * scroll container's height, stick the head inside it. The catalog — the surface's default tab, and
 * the one the sweep cited as the exemplar for this pattern — had neither, so all 42 audits rendered
 * into a 3883px page and the bare numbers under CHANGE POTENTIAL / PROJECTS / REPORTS were read with
 * their column labels scrolled off the top.
 */
describe('a long audits table caps itself and keeps its head', () => {
	test('every audits table is bounded, and bounded on whatever actually scrolls', async () => {
		// The cap has to land on the element that scrolls. Applicability puts its table straight in
		// the Card, so the Card is it. Catalog and Overrides wrap theirs in an `OverflowScroller`
		// for the horizontal fade, and that scroller is already a scroll container in both axes —
		// capping the Card outside it would leave the head stuck to a box that never moves.
		//
		// Overrides was the third form and is now the second: it capped the Card with `overflow-auto`
		// and got a scrollport with no fade and no tab stop, which is also why the affordance guard
		// (written against `overflow-x-auto`) never saw it.
		//
		// The subtrahend is per-tab, because what sits above each table differs: Applicability
		// carries a toolbar whose header holds two lines of prose, so its cap is deeper. It was
		// `16rem` like the others, and the card itself then overflowed the viewport — the tab
		// scrolled the page *and* the card, which is the double scroll the cap exists to remove.
		expect(await read(TABS, 'ApplicabilityTab.tsx')).toContain(
			'max-h-[calc(100dvh-24rem)] overflow-auto p-0',
		);
		expect(await read(TABS, 'OverridesList.tsx')).toContain(
			'scrollerClassName="max-h-[calc(100dvh-16rem)]"',
		);
		expect(await read(TABS, 'CatalogTable.tsx')).toContain(
			'scrollerClassName="max-h-[calc(100dvh-16rem)]"',
		);
	});

	test('every audits table head is sticky', async () => {
		// Overrides moved its table into `OverridesList.tsx` when the list gained a non-colour
		// override marker and its own filter state; the head went with it.
		for (const file of ['ApplicabilityTab.tsx', 'OverridesList.tsx', 'CatalogTable.tsx']) {
			const source = await read(TABS, file);
			expect(source).toContain('${tableHeadClass} sticky top-0 z-10');
		}
	});

	test('the sticky head paints its own background, cell by cell', async () => {
		// A `<thead>` does not reliably paint a background of its own while stuck, so the rows scroll
		// through the labels rather than under them. Both siblings put `bg-muted` on each `<th>`;
		// the catalog's seven now do too — seven, not six, since the change-potential score became a
		// right-aligned column of its own instead of trailing the band badge.
		const source = await read(TABS, 'CatalogTable.tsx');
		const heads = source.slice(source.indexOf('<thead'), source.indexOf('</thead>'));
		const cells = heads.match(/<th\b[^>]*/g) ?? [];
		expect(cells.length).toBe(7);
		for (const cell of cells) expect(cell).toMatch(/bg-muted|numericHead/u);
	});

	test('the catalog keeps the column scopes it already had', async () => {
		// The cap is a layout change. A header cell that stopped naming its column would trade one
		// unlabelled reading for another.
		const source = await read(TABS, 'CatalogTable.tsx');
		const heads = source.slice(source.indexOf('<thead'), source.indexOf('</thead>'));
		expect((heads.match(/scope="col"/g) ?? []).length).toBe(7);
		expect(source).toContain('aria-label="Audit catalog"');
	});
});
