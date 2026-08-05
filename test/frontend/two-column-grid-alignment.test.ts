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

	test('Skills catalog stays at its own height beside the details column', async () => {
		const source = await read('pages/skills/SkillsPage.tsx');

		expect(source).toContain('lg:self-start');
		expect(source).toContain('max-h-[34rem]');
	});
});
