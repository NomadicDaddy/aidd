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

	test('Director pairs the uncapped suggestion queue with capped Recent Cycles', async () => {
		const page = await read('pages/director/DirectorPage.tsx');
		const cycles = await read('pages/director/DirectorSuggestions.tsx');

		expect(page).toContain('grid gap-5 lg:grid-cols-2 lg:items-start');
		// Recent Cycles owns its scroll region; the alignment rule is what stops the Card around
		// it from growing past that cap.
		expect(cycles).toContain('max-h-[28rem]');
	});

	test('Skills catalog scrolls to the viewport rather than to a fixed cap', async () => {
		const page = await read('pages/skills/SkillsPage.tsx');
		const catalog = await read('pages/skills/SkillCatalog.tsx');

		expect(page).toContain('grid min-w-0 items-start gap-4');
		// `max-h-[34rem]` capped the list ~350px above the card's own bottom edge, so the operator
		// scrolled a short inner window inside a long outer page. The scrollport is now the
		// viewport, and sticky keeps it beside the details column while that column scrolls.
		expect(catalog).toContain('max-h-[calc(100vh-9rem)]');
		expect(catalog).toContain('lg:sticky lg:top-4');
		expect(catalog).toContain('min-h-0 flex-1 space-y-1 overflow-auto');
		expect(page).not.toContain('max-h-[34rem]');
	});
});
