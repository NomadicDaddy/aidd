import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dir, '../../frontend/src');
const TABS = join(SRC, 'pages/audits/tabs');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(...segments)).text();
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
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
		// The cap has to land on the element that scrolls. All three tabs now wrap their table in
		// an `OverflowScroller`, and that scroller is already a scroll container in both axes —
		// capping the Card outside it would leave the head stuck to a box that never moves.
		//
		// Applicability was the last one capping the Card directly, and it paid the same price
		// Overrides did before it: a scrollport with no fade and no tab stop, invisible to the
		// affordance guard (written against `overflow-x-auto`). It cost the document height too —
		// the page followed the *un*clipped table, so 843px of nothing scrolled below the card.
		//
		// The subtrahend is per-tab, because what sits above each table differs: Applicability
		// carries a toolbar whose header holds two lines of prose, so its cap is deeper. It was
		// `16rem` like the others, and the card itself then overflowed the viewport — the tab
		// scrolled the page *and* the card, which is the double scroll the cap exists to remove.
		// That is a fact about this tab's chrome, so it survived the cap moving inward.
		expect(await read(TABS, 'ApplicabilityTab.tsx')).toContain(
			'scrollerClassName="max-h-[calc(100dvh-24rem)]"',
		);
		expect(await read(TABS, 'CatalogTable.tsx')).toContain(
			'scrollerClassName="max-h-[calc(100dvh-16rem)]"',
		);
	});

	test('a 100dvh cap only applies at the content width its subtrahend supports', async () => {
		// The rule, not a shared viewport breakpoint. Applicability and Catalog swap to cards below
		// `xl`, so their desktop caps leave with their tables. Overrides keeps the same two-column
		// table everywhere: it queries the tab's own width so the cap engages in the 736px content
		// region at a 1024px viewport, but not in the 656px region at 768 or on phones.
		//
		// This assertion previously required `max-h-[calc(100dvh-16rem)] overflow-auto p-0` verbatim
		// on the Overrides card, which is the string that put its bottom edge 98px past the fold at
		// 390px and 234px at 768px. A guard written as a snapshot of the day's markup pins whatever
		// was there, defect included, and hands the next fixer a red build that reads as "you were
		// wrong".
		//
		const overridesList = stripComments(await read(TABS, 'OverridesList.tsx'));
		const overridesTab = stripComments(await read(TABS, 'OverridesTab.tsx'));
		const overridesCaps =
			overridesTab.match(/(?:@min-\[45rem\]:)?max-h-\[calc\(100dvh-\d+rem\)\]/g) ?? [];
		expect(overridesCaps).toEqual(['@min-[45rem]:max-h-[calc(100dvh-16rem)]']);
		expect(overridesTab).toContain('<div className="@container space-y-4">');
		expect(overridesTab).toContain('xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.6fr)]');
		expect(overridesList).toContain('scrollerClassName={scrollerClassName}');

		// Comments stripped first: each module explains its gate directly above the class that carries
		// it, and a guard that reads the explanation as implementation passes on prose alone.
		const offenders: string[] = [];
		for (const file of ['ApplicabilityTab.tsx', 'CatalogTable.tsx']) {
			const source = stripComments(await read(TABS, file));
			for (const match of source.matchAll(/max-h-\[calc\(100dvh/g)) {
				// The gate is either on the cap's own class list — Applicability's `xl:block` shares
				// the attribute — or on an ancestor written above it, which is how the Catalog card
				// gates a cap two elements down.
				const attrStart = source.lastIndexOf('="', match.index);
				const attr = source.slice(attrStart, source.indexOf('"', attrStart + 2));
				if (attr.includes('xl:') || source.slice(0, attrStart).includes('xl:block'))
					continue;
				offenders.push(`${file}: ungated 100dvh cap`);
			}
		}
		expect(offenders).toEqual([]);
	});

	test('the override select is sized by its options, not by a fixed width', async () => {
		const source = stripComments(await read(TABS, 'OverridesList.tsx'));
		const select = source.slice(source.indexOf('<select'), source.indexOf('</select>'));

		// `w-36` (144px) with `ml-auto`, in a two-column row whose other column is an audit name, made
		// the row wider than the card at 390px. What the card did about it was clip — `overflow-auto`
		// renders no scrollbar and no affordance on touch — so roughly a third of every select,
		// including the chevron, was not hittable. Default / Required / Disabled / Excluded size a
		// select to well under 144px on their own, and identically in every row.
		expect(select).not.toMatch(/\bw-(?:\d|\[|full)/);
		expect(source).toContain('wrap-anywhere');
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
		//
		// Four of the seven are `SortableColumnHeader`, which renders the `<th>` itself and takes
		// its classes as a prop, so the count spans both spellings.
		const source = await read(TABS, 'CatalogTable.tsx');
		const heads = source.slice(source.indexOf('<thead'), source.indexOf('</thead>'));
		const cells = heads.match(/<(?:th|SortableColumnHeader)\b[\s\S]*?(?:\/>|>)/g) ?? [];
		expect(cells.length).toBe(7);
		for (const cell of cells) expect(cell).toMatch(/bg-muted|numericHead/u);
	});

	test('the catalog keeps the column scopes it already had', async () => {
		// The cap is a layout change. A header cell that stopped naming its column would trade one
		// unlabelled reading for another. Three cells spell `scope` here; the other four get it from
		// the shared sortable header, which is where it has to live so the next table cannot ship
		// without it.
		const source = await read(TABS, 'CatalogTable.tsx');
		const shared = await read(SRC, 'components/shared/SortableColumnHeader.tsx');
		const heads = source.slice(source.indexOf('<thead'), source.indexOf('</thead>'));
		expect((heads.match(/scope="col"/g) ?? []).length).toBe(3);
		expect((heads.match(/<SortableColumnHeader\b/g) ?? []).length).toBe(4);
		expect(shared).toContain('scope="col"');
		expect(source).toContain('aria-label="Audit catalog"');
	});
});
