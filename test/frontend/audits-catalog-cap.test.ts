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
		// The cap has to land on the element that scrolls. Applicability and Overrides put their
		// table straight in the Card, so the Card is it. The catalog wraps its table in an
		// `OverflowScroller` for the horizontal fade, and that scroller is already a scroll
		// container in both axes — capping the Card outside it would leave the head stuck to a box
		// that never moves.
		const cap = 'max-h-[calc(100dvh-16rem)]';
		expect(await read(TABS, 'ApplicabilityTab.tsx')).toContain(`${cap} overflow-auto p-0`);
		expect(await read(TABS, 'OverridesTab.tsx')).toContain(`${cap} overflow-auto p-0`);
		expect(await read(TABS, 'CatalogTable.tsx')).toContain(`scrollerClassName="${cap}"`);
	});

	test('every audits table head is sticky', async () => {
		for (const file of ['ApplicabilityTab.tsx', 'OverridesTab.tsx', 'CatalogTable.tsx']) {
			const source = await read(TABS, file);
			expect(source).toContain('${tableHeadClass} sticky top-0 z-10');
		}
	});

	test('the sticky head paints its own background, cell by cell', async () => {
		// A `<thead>` does not reliably paint a background of its own while stuck, so the rows scroll
		// through the labels rather than under them. Both siblings put `bg-muted` on each `<th>`;
		// the catalog's six now do too.
		const source = await read(TABS, 'CatalogTable.tsx');
		const heads = source.slice(source.indexOf('<thead'), source.indexOf('</thead>'));
		const cells = heads.match(/<th\b[^>]*/g) ?? [];
		expect(cells.length).toBe(6);
		for (const cell of cells) expect(cell).toContain('bg-muted');
	});

	test('the catalog keeps the column scopes it already had', async () => {
		// The cap is a layout change. A header cell that stopped naming its column would trade one
		// unlabelled reading for another.
		const source = await read(TABS, 'CatalogTable.tsx');
		const heads = source.slice(source.indexOf('<thead'), source.indexOf('</thead>'));
		expect((heads.match(/scope="col"/g) ?? []).length).toBe(6);
		expect(source).toContain('aria-label="Audit catalog"');
	});
});
