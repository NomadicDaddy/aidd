import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(relativePath: string): Promise<string> {
	return readFile(join(frontendSource, ...relativePath.split('/')), 'utf8');
}

// Three two-column surfaces used to leave a dead column, each for its own reason: a card whose
// content stopped growing was still stretched to the height of whichever unrelated card shared its
// row. The fix is a local alignment rule per surface, never a shared height cap — a cap would fight
// Dashboard's persisted per-card heights and introduce nested scrolling.
describe('two-column grids do not stretch a card past its own content', () => {
	test('Dashboard aligns cards to the start and imposes no shared height policy', async () => {
		const source = await read('pages/dashboard/SortableDashboardGrid.tsx');

		expect(source).toContain('className="grid items-start gap-4 xl:grid-cols-2"');
		// A shared cap or forced equal-height row would override the persisted per-card heights
		// that SortableDashboardCard writes as an inline pixel height.
		expect(source).not.toMatch(/\bmax-h-|\bh-full\b|auto-rows-fr/);
	});

	test('Dashboard cards still carry their persisted height and drag order', async () => {
		const source = await read('pages/dashboard/SortableDashboardCard.tsx');

		expect(source).toContain('height: height === undefined ? undefined : `${height}px`');
		expect(source).toContain('useSortable(');
	});

	test('Director stacks Run Cycle above Recent Cycles and runs Suggestions full width', async () => {
		const page = await read('pages/director/DirectorPage.tsx');
		const cycles = await read('pages/director/DirectorRecentCycles.tsx');

		// The dead column is gone by composition rather than by an alignment rule: the short Run
		// Cycle card and the capped Recent Cycles card share the right column of the single
		// two-column row, and the suggestion queue — rows, not a column — spans the page below it.
		expect(page).toContain('grid gap-5 lg:grid-cols-2');
		expect(page).toMatch(
			/<div className="space-y-5">[\s\S]*<DirectorRecentCycles cycles=\{cycles\} now=\{now\} \/>\s*<\/div>/,
		);
		expect(page).not.toContain('lg:grid-cols-2 lg:items-start');
		// Recent Cycles owns its scroll region, so the card around it stops growing on its own.
		expect(cycles).toContain('max-h-[28rem]');
	});

	test('Skills catalog fills a measured region rather than a fixed cap', async () => {
		const page = await read('pages/skills/SkillsPage.tsx');
		// Comments stripped: the card's docstring names the cap it replaced, and an assertion that
		// the class is gone should not be defeated by the sentence explaining why it went.
		const catalog = (await read('pages/skills/SkillCatalog.tsx'))
			.replaceAll(/\/\*[\s\S]*?\*\//g, '')
			.replaceAll(/\/\/[^\n]*/g, '');

		// This is the one surface here whose dead column was solved by making the split a sized
		// region instead of by an alignment rule, so `items-start` is deliberately absent: both
		// columns are full-height scrollports and the page above them does not scroll.
		expect(page).toContain('grid min-w-0 gap-4 lg:h-[var(--fill-height');
		expect(page).not.toContain('items-start');
		// `max-h-[34rem]` capped the list ~350px above the card's own bottom edge; replacing it
		// with `max-h-[calc(100vh-9rem)]` only moved the guess — 9rem against 188px of real chrome
		// put the last row below the fold, and `lg:sticky` never engaged because the detail column
		// had no scrollport, so the document scrolled instead of the region.
		expect(catalog).not.toContain('max-h-[calc(100vh-9rem)]');
		expect(catalog).not.toContain('lg:sticky');
		expect(catalog).toContain('lg:h-full');
		expect(catalog).toContain('min-h-0 flex-1 overflow-auto');
		expect(page).not.toContain('max-h-[34rem]');
	});
});
