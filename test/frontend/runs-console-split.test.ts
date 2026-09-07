import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dir, '../../frontend/src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(SRC, ...segments)).text();
}

/**
 * Once the region is wide enough the console column is sticky at a measured viewport height, so
 * everything inside it is dividing one fixed budget. The run metadata was unbounded and the
 * transcript took what was left, which for a finished run with commits, file changes and a stop
 * transcript was ~32px — one line of a 53,000px transcript, under a truncation notice taller than
 * the output it described.
 *
 * The threshold is the region's own width (`@min-[88.375rem]:`), not the window's, so the height
 * chain has to be expressed the same way the column that bounds it is.
 */
describe('the live console gets the bulk of its column', () => {
	test('the metadata block is the part that gives', async () => {
		const source = await read('pages/runs/LiveConsole.tsx');

		// `min-height: auto` is the default for a flex item, and it is what made this block
		// unshrinkable no matter what the transcript asked for. Both halves are needed: `min-h-0`
		// so it may shrink, `overflow-y-auto` so what it loses is still reachable.
		expect(source).toContain(
			'<div className="@min-[88.375rem]:min-h-0 @min-[88.375rem]:overflow-y-auto">',
		);
		const wrapper = source.slice(
			source.indexOf('@min-[88.375rem]:min-h-0 @min-[88.375rem]:overflow-y-auto'),
		);
		expect(wrapper.slice(0, 200)).toContain('<RunDetailPanel');
	});

	test('the transcript takes the remainder without imposing a second height budget', async () => {
		const source = await read('pages/runs/LiveConsole.tsx');

		// The selected console already owns the viewport-height column. At split widths the
		// transcript should take the remainder of that one budget, while the independently
		// scrollable metadata region yields when necessary.
		expect(source).toContain('@min-[88.375rem]:max-h-none');
		expect(source).toContain('@min-[88.375rem]:min-h-0 @min-[88.375rem]:flex-1');
		expect(source).not.toContain('@min-[88.375rem]:min-h-[27rem]');
	});

	test('the column that does the dividing fills the measured sticky workspace', async () => {
		const page = await read('pages/runs/RunsPage.tsx');

		// The flex remainder and the shrink only mean something inside a bounded column. The page
		// measures that boundary and publishes it as `--fill-height`, and the console column is the
		// one thing that resolves it — it was `h-full` of a grid the page forced to the same height,
		// which bound History to the budget too and cost the reader rows every time the window grew.
		expect(page).toContain('useViewportFill<HTMLDivElement>');
		expect(page).toContain('@min-[88.375rem]:h-[var(--fill-height)]');
		expect(page).not.toContain('@min-[88.375rem]:h-full');
		expect(page).not.toContain('h-[calc(100dvh-3rem)]');
		expect(page).toContain('@min-[88.375rem]:sticky');
		// The budget is published by the grid and resolved by the column, never imposed on the
		// grid: the only class list carrying the fill height is the console column's.
		const gridClasses = page.slice(
			page.indexOf('RUNS_SPLIT_COLUMNS_CLASS,'),
			page.indexOf('ref={runsViewportRef}'),
		);
		expect(gridClasses).not.toContain('var(--fill-height)');
	});

	test('the split and console column exist only while a run is selected', async () => {
		const page = await read('pages/runs/RunsPage.tsx');

		expect(page).toContain("'grid min-w-0 gap-5'");
		expect(page).toContain('page.selection !== undefined &&');
		expect(page).toContain("page.selection === undefined && 'sm:hidden'");
	});

	test('the truncation notice stays two short paragraphs', async () => {
		const notices = await read('pages/runs/LiveConsoleNotices.tsx');

		// It read as larger than the output only because the output was 32px. It is still advisory
		// text and must stay that way — a notice that grows into a block competes with the transcript.
		expect(notices).toContain('mb-2 text-xs text-muted-foreground');
		expect((notices.match(/<p /g) ?? []).length).toBe(2);
	});
});
