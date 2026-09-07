import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { dashboardCardPlacements } from '../../frontend/src/pages/dashboard/dashboard-shared.ts';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(relativePath: string): Promise<string> {
	return readFile(join(frontendSource, ...relativePath.split('/')), 'utf8');
}

// Three two-column surfaces can each leave a dead column, for its own reason: a card whose
// content stopped growing is stretched to the height of whichever unrelated card shares its
// row. The fix is a local alignment rule per surface, never a shared height cap — a cap would fight
// Dashboard's persisted per-card heights and introduce nested scrolling.
describe('two-column grids do not stretch a card past its own content', () => {
	test('Dashboard aligns cards to the start and imposes no shared height policy', async () => {
		const source = await read('pages/dashboard/SortableDashboardGrid.tsx');

		// `page-reveal` on the same element is the entrance ladder, not a height policy: the section
		// is the page reveal's third child, so without it all seven cards arrived in one beat.
		expect(source).toContain("const cardGapClass = locked ? 'gap-4' : 'gap-x-4 gap-y-6';");
		expect(source).toContain('`page-reveal grid items-start ${cardGapClass} xl:grid-cols-2`');
		expect(source).toContain('xl:auto-rows-[1px]');
		// A shared cap or forced equal-height row would override the persisted per-card heights
		// that SortableDashboardCard writes as an inline pixel height.
		expect(source).not.toMatch(/\bmax-h-|\bh-full\b|auto-rows-fr/);
	});

	test('Dashboard half-width runs advance as independent ordered columns', () => {
		const placements = dashboardCardPlacements(
			[false, false, false, true, false, false],
			[100, 300, 120, 200, 150, 100],
		);

		expect(placements).toEqual([
			{ column: 1, rowSpan: 100, rowStart: 1 },
			{ column: 2, rowSpan: 300, rowStart: 1 },
			{ column: 1, rowSpan: 120, rowStart: 117 },
			{ column: '1 / -1', rowSpan: 200, rowStart: 317 },
			{ column: 1, rowSpan: 150, rowStart: 533 },
			{ column: 2, rowSpan: 100, rowStart: 533 },
		]);
	});

	test('Dashboard preserves the existing final-orphan stretch without changing saved width', () => {
		const placements = dashboardCardPlacements(
			[false, false, true, false, false, false],
			[100, 80, 200, 120, 100, 90],
		);

		expect(placements.at(-1)).toEqual({
			column: '1 / -1',
			rowSpan: 90,
			rowStart: 469,
		});
	});

	test('Dashboard cards still carry their persisted height and drag order', async () => {
		const source = await read('pages/dashboard/SortableDashboardCard.tsx');

		expect(source).toContain('height: height === undefined ? undefined : `${height}px`');
		expect(source).toContain('useSortable(');
	});

	test('Director stacks Recent Cycles under Suggestions in the wider operational column', async () => {
		const page = await read('pages/director/DirectorPage.tsx');
		const cycles = await read('pages/director/DirectorRecentCycles.tsx');

		// The Director flow reads down the leading column: launch a Cycle, act on its Suggestions,
		// then inspect history. Chat remains the narrower trailing-column surface.
		expect(page).toContain(
			'grid items-start gap-5 @min-[68rem]:grid-cols-[minmax(0,3fr)_minmax(28rem,2fr)]',
		);
		expect(page).toMatch(
			/<div className="min-w-0 space-y-5">[\s\S]*<DirectorSuggestionsList[\s\S]*suggestions=\{suggestions\}[\s\S]*\/>\s*<DirectorRecentCycles cycles=\{cycles\} loading=\{cyclesLoading\} now=\{now\} \/>\s*<\/div>/,
		);
		// Suggestion filters have a wide intrinsic size. The grid item must be allowed to shrink or
		// moving the queue into it widens the 390px page to the filter row's min-content width.
		expect(page).toContain('<div className="min-w-0 space-y-5">');
		expect(page.indexOf('<DirectorSuggestionsList')).toBeLessThan(
			page.indexOf('<DirectorRecentCycles'),
		);
		expect(page.indexOf('<DirectorChatSection')).toBeGreaterThan(
			page.indexOf('<DirectorSuggestionsList'),
		);
		expect(page).not.toContain('@min-[68rem]:grid-cols-2');
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

		// The outer split remains two full-height scrollports. Inside the detail scrollport, the
		// launch surface stops at its declared field measure and Definition takes the elastic track.
		expect(page).toContain('grid min-w-0 items-start gap-4 @min-[40rem]:h-[var(--fill-height');
		expect(page).toContain(
			'grid items-start gap-4 @min-[80rem]:grid-cols-[minmax(18rem,36rem)_minmax(0,1fr)]',
		);
		// `max-h-[34rem]` capped the list ~350px above the card's own bottom edge; replacing it
		// with `max-h-[calc(100vh-9rem)]` only moved the guess — 9rem against 188px of real chrome
		// put the last row below the fold, and `lg:sticky` never engaged because the detail column
		// had no scrollport, so the document scrolled instead of the region.
		expect(catalog).not.toContain('max-h-[calc(100vh-9rem)]');
		expect(catalog).not.toContain('lg:sticky');
		expect(catalog).toContain('@min-[40rem]:max-h-full');
		expect(catalog).toContain('min-h-0 flex-1 overflow-auto');
		expect(page).not.toContain('max-h-[34rem]');
	});
});
