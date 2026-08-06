import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(srcRoot, ...segments)).text();
}

/**
 * The house pattern is BOTH halves: a wide table inside an `xl:`-gated `OverflowScroller`, and an
 * `xl:hidden` sibling presenting the same rows as cards. Asserting one half is what let
 * `InvocationsTable` pass a review while rendering 812px of table into a 324px scrollport.
 *
 * These assert the structure, not a literal class string, so a reformat or a class reorder does not
 * fail them and a genuine regression does.
 */
function assertContainedTable(source: string, label: string): void {
	const scrollerAt = source.indexOf('<OverflowScroller');
	const tableAt = source.indexOf('<table');
	expect([label, scrollerAt >= 0]).toEqual([label, true]);
	// The table is inside the scroller, not beside it.
	expect(tableAt).toBeGreaterThan(scrollerAt);
	// The scroller is gated to the content breakpoint...
	expect(source.slice(scrollerAt, tableAt)).toMatch(/xl:block/);
	// ...and something else renders below it.
	expect(source).toMatch(/xl:hidden/);
}

describe('wide tables are contained and replaced', () => {
	test('the project Runs tab reaches its Action column at every width', async () => {
		const panel = await read('pages', 'projects', 'detail', 'ActiveRunsPanel.tsx');

		// The regression this guards: the six-column table sat directly in a Card carrying
		// `overflow-hidden p-0` with no scroller at all, so the Action cell was clipped past the
		// card edge with no scroll to recover it. Not off-screen — unreachable.
		assertContainedTable(panel, 'ActiveRunsPanel');

		// Both halves reach the Live Console, and the card stack carries every column the table
		// does rather than dropping the ones that did not fit.
		const stack = panel.slice(panel.indexOf('xl:hidden'));
		for (const field of ['Open in Live Console', 'run.mode', 'run.status', 'run.startedAt']) {
			expect(stack).toContain(field);
		}
	});

	test('the placeholder is not a table row only', async () => {
		const panel = await read('pages', 'projects', 'detail', 'ActiveRunsPanel.tsx');

		// Loading, error and empty used to exist solely as a `colSpan={6}` <td>, which a card
		// stack has no equivalent of — the stack would have rendered as nothing at all.
		expect(panel).toContain('const placeholder =');
		expect(panel.slice(panel.indexOf('xl:hidden'))).toContain('{placeholder}');
	});
});
