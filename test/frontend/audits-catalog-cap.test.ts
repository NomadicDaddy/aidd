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
describe('long audit inventories use the scroll behavior their composition needs', () => {
	test('the matrix is bounded while the catalog remains in document flow', async () => {
		// The cap has to land on the element that scrolls. All three tabs now wrap their table in
		// an `OverflowScroller`, and that scroller is already a scroll container in both axes —
		// capping the Card outside it would leave the head stuck to a box that never moves.
		//
		// Applicability was the last one capping the Card directly, and it paid the same price
		// Overrides did before it: a scrollport with no fade and no tab stop, invisible to the
		// affordance guard (written against `overflow-x-auto`). It cost the document height too —
		// the page followed the *un*clipped table, so 843px of nothing scrolled below the card.
		//
		// Both tables used fixed subtrahends even though their toolbars can wrap and Applicability
		// can insert an editor above its matrix. Each now measures the scrollport's actual top and
		// inherits the resulting custom property into the element that scrolls.
		const applicability = await read(TABS, 'ApplicabilityTab.tsx');
		const catalog = await read(TABS, 'CatalogTable.tsx');
		expect(applicability).toContain('useViewportFill<HTMLDivElement>');
		expect(applicability).toContain('rootRef={matrixRef}');
		expect(applicability).toContain('scrollerClassName={viewportFillScrollerClass}');
		expect(catalog).not.toContain('useViewportFill<HTMLDivElement>');
		expect(catalog).not.toContain('scrollerClassName={viewportFillScrollerClass}');
	});

	test('all three long audit inventories own measured desktop scrollports', async () => {
		const overridesList = stripComments(await read(TABS, 'OverridesList.tsx'));
		expect(overridesList).toContain('OverflowScroller');
		expect(overridesList).toContain('useViewportFill<HTMLDivElement>');
		expect(overridesList).toContain('xl:max-h-[var(--fill-height)]');
		// The scrollport is the xl branch's alone, so the two-column split is unprefixed inside
		// it and the wrapper carries the gate. Narrow the table stands in page flow instead: the
		// wrapper had no height cap there, and its `overflow-x-auto` still captured the head's
		// `sticky`, which is how a 3695px table scrolled its own column labels permanently away.
		expect(overridesList).toContain('className="hidden xl:block"');
		expect(overridesList).toContain('grid grid-cols-2 items-start');

		const applicability = stripComments(await read(TABS, 'ApplicabilityTab.tsx'));
		const catalog = stripComments(await read(TABS, 'CatalogTable.tsx'));
		expect(applicability).toContain('scrollerClassName={viewportFillScrollerClass}');
		expect(applicability).toContain('xl:block');
		expect(catalog).toContain('ariaLabel="Audit catalog"');
		expect(catalog).toContain('group-data-[overflow-end=false]:overflow-visible');
		expect(catalog).toContain('xl:block');
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

	test('every capped audits table head is sticky', async () => {
		for (const file of ['ApplicabilityTab.tsx']) {
			const source = await read(TABS, file);
			expect(source).toContain('${tableHeadClass} sticky top-0 z-10');
		}
		expect(await read(TABS, 'CatalogTable.tsx')).toContain(
			'<thead className={tableHeadClass}>',
		);
		// This head takes its offset from the branch that renders it: `top-0` against the xl
		// scrollport, and the shell's top bar narrow, where there is no scrollport to stick to and
		// the document is what scrolls.
		const overrides = await read(TABS, 'OverridesList.tsx');
		expect(overrides).toContain('${tableHeadClass} sticky z-10 ${headOffsetClass}');
		expect(overrides).toContain('headOffsetClass="top-0"');
		expect(overrides).toContain('headOffsetClass="top-[var(--app-topbar-height,0px)]"');
	});

	test('the sticky head paints its own background, cell by cell', async () => {
		// A `<thead>` does not reliably paint a background of its own while stuck, so the rows scroll
		// through the labels rather than under them. Both siblings put `bg-muted` on each `<th>`;
		// the catalog's seven now do too — seven, not six, since the change-potential score became a
		// right-aligned column of its own instead of trailing the band badge.
		//
		// Five of the seven are `SortableColumnHeader`, which renders the `<th>` itself and takes
		// its classes as a prop, so the count spans both spellings.
		const source = await read(TABS, 'CatalogTable.tsx');
		const heads = source.slice(source.indexOf('<thead'), source.indexOf('</thead>'));
		const cells = heads.match(/<(?:th|SortableColumnHeader)\b[\s\S]*?(?:\/>|>)/g) ?? [];
		expect(cells.length).toBe(7);
		for (const cell of cells) expect(cell).toMatch(/bg-muted|compactHead|numericHead/u);
	});

	test('the catalog keeps the column scopes it already had', async () => {
		// The cap is a layout change. A header cell that stopped naming its column would trade one
		// unlabelled reading for another. Two cells spell `scope` here; the other five get it from
		// the shared sortable header, which is where it has to live so the next table cannot ship
		// without it. Only the selection cell spells `scope`; all six data columns are sortable.
		const source = await read(TABS, 'CatalogTable.tsx');
		const shared = await read(SRC, 'components/shared/SortableColumnHeader.tsx');
		const heads = source.slice(source.indexOf('<thead'), source.indexOf('</thead>'));
		expect((heads.match(/scope="col"/g) ?? []).length).toBe(1);
		expect((heads.match(/<SortableColumnHeader\b/g) ?? []).length).toBe(6);
		expect(shared).toContain('scope="col"');
		expect(source).toContain('aria-label="Audit catalog"');
	});
});
