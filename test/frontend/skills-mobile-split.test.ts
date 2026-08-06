import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

function read(path: string): Promise<string> {
	return Bun.file(join(ROOT, path)).text();
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

const PAGE = 'frontend/src/pages/skills/SkillsPage.tsx';
const CATALOG = 'frontend/src/pages/skills/SkillCatalog.tsx';

describe('the skills split has a layout below its split point', () => {
	test('the split is gated on the region, not on the viewport', async () => {
		const page = stripComments(await read(PAGE));
		const catalog = stripComments(await read(CATALOG));

		// Every affordance of the split was `lg:` — the grid columns, the measured height, the
		// overflow, and the detail column's own scrollport. Below 1024px none of them applied, so
		// there was no fallback layout, there was the absence of the layout.
		//
		// It is a container query now because the width that has to fit is the content column's and
		// the sidebar rail sets that independently of the viewport: 768px of viewport is 656px of
		// column with the rail collapsed and 480px with it expanded, and both states occur in
		// practice. A viewport gate is wrong in both directions at once — it called 768 narrow when
		// it is not, and 1024 wide when it is not.
		for (const source of [page, catalog]) {
			expect(source).not.toMatch(/lg:(?:h-|grid-cols-\[minmax\(18|overflow-|pr-1)/);
		}
		expect(page).toContain('@min-[40rem]:grid-cols-[minmax(18rem,24rem)_1fr]');
		expect(page).toContain('@min-[40rem]:h-[var(--fill-height');
		expect(page).toContain('@min-[40rem]:overflow-hidden');
		expect(catalog).toContain('@min-[40rem]:h-full');
	});

	test('the container is an ancestor of the query, not the queried element', async () => {
		const page = await read(PAGE);

		// A container query cannot style the element that declares the containment, so `@container`
		// and `@min-[40rem]:*` on one element silently query some outer container or none at all —
		// and the failure is a layout that never switches, which reads exactly like a wrong
		// threshold. The wrapper exists for this reason alone.
		const containerAt = page.indexOf('className="@container"');
		const queryAt = page.indexOf('@min-[40rem]:grid-cols-');

		expect(containerAt).toBeGreaterThan(-1);
		expect(queryAt).toBeGreaterThan(containerAt);

		// The queried element's own class list — `className="` through its closing quote — must not
		// declare the containment it queries. That is the whole failure mode: `@container` and
		// `@min-[40rem]:*` together on one element query some outer container, or none.
		const attrStart = page.lastIndexOf('className="', queryAt);
		const attrEnd = page.indexOf('"', attrStart + 'className="'.length);
		expect(page.slice(attrStart, attrEnd)).not.toContain('@container');
	});

	test('below the split point the two panes are alternatives, not a stack', async () => {
		const page = stripComments(await read(PAGE));

		// Stacked, the catalog ran 5850px down the document with the detail beginning past the end
		// of it. Selecting the 30th of 76 skills swapped content 3962px below the fold, which on a
		// phone is indistinguishable from a tap that did nothing at all.
		expect(page).toContain("showDetail ? 'hidden @min-[40rem]:flex' : undefined");
		expect(page).toContain("showDetail ? undefined : 'hidden @min-[40rem]:block'");
	});

	test('a selection below the split point is acknowledged and reversible', async () => {
		const page = stripComments(await read(PAGE));

		// The acknowledgement: the pane comes with the selection, and the region comes back into
		// view — the tap that opened it may have been five screens down.
		expect(page).toContain('function selectSkill(');
		expect(page).toContain('setShowDetail(true)');
		expect(page).toContain("region.scrollIntoView({ block: 'start' })");
		expect(page).toContain('onSelect={selectSkill}');
		expect(page).not.toContain('onSelect={setSelectedId}');

		// The way back. Gated to the widths where the panes are alternatives, and placed at the top
		// of the detail — a control 2000px into a SKILL.md is not a way back.
		const backAt = page.indexOf('All skills');
		const detailAt = page.indexOf('<SkillDetailsCard');
		expect(backAt).toBeGreaterThan(-1);
		expect(detailAt).toBeGreaterThan(backAt);
		expect(page).toContain('setShowDetail(false)');
		expect(page.slice(0, backAt)).toContain('@min-[40rem]:hidden');
	});

	test('the threshold is measured off the region, never off the viewport', async () => {
		const page = stripComments(await read(PAGE));

		// `window.innerWidth` and a viewport media query both answer a question this layout is not
		// asking. The region's own width is the quantity the CSS gates on, so it is the quantity
		// the handler reads — otherwise the two disagree at exactly the widths that motivated the
		// container query, which is every width where the rail is expanded.
		expect(page).toContain('region.offsetWidth >= SPLIT_MIN_WIDTH');
		expect(page).not.toContain('innerWidth');
		expect(page).not.toContain('matchMedia');

		// The constant and the class name are the same number stated twice; they have to agree.
		expect(page).toMatch(/const SPLIT_MIN_WIDTH = 640;/);
		expect(page).toContain('@min-[40rem]:');
	});

	test('the empty detail does not repeat the catalog’s own empty state', async () => {
		const page = stripComments(await read(PAGE));

		// Below the split the catalog occupies the whole region and already says there is nothing
		// to show. A second copy stacked underneath is not a second piece of information.
		expect(page).toContain('<div className="hidden @min-[40rem]:block">{emptyDetail}</div>');
	});
});
