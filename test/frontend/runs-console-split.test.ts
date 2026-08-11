import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dir, '../../frontend/src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(SRC, ...segments)).text();
}

/**
 * Once the region is wide enough the console column is sticky at a fixed viewport height, so
 * everything inside it is dividing one fixed budget. The run metadata was unbounded and the
 * transcript took what was left, which for a finished run with commits, file changes and a stop
 * transcript was ~32px — one line of a 53,000px transcript, under a truncation notice taller than
 * the output it described.
 *
 * The threshold is the region's own width (`@min-[66rem]:`), not the window's, so the height chain
 * has to be expressed the same way the column that bounds it is.
 */
describe('the live console gets the bulk of its column', () => {
	test('the metadata block is the part that gives', async () => {
		const source = await read('pages/runs/LiveConsole.tsx');

		// `min-height: auto` is the default for a flex item, and it is what made this block
		// unshrinkable no matter what the transcript asked for. Both halves are needed: `min-h-0`
		// so it may shrink, `overflow-y-auto` so what it loses is still reachable.
		expect(source).toContain(
			'<div className="@min-[66rem]:min-h-0 @min-[66rem]:overflow-y-auto">',
		);
		const wrapper = source.slice(
			source.indexOf('@min-[66rem]:min-h-0 @min-[66rem]:overflow-y-auto'),
		);
		expect(wrapper.slice(0, 200)).toContain('<RunDetailPanel');
	});

	test('the transcript has a floor, and the floor is twenty lines', async () => {
		const source = await read('pages/runs/LiveConsole.tsx');

		// `flex-1` alone does not survive a full container: a `basis: 0` item claims free space and
		// concedes all of it when there is none. The floor is what the panel has to clear to be
		// worth opening. text-xs (12px) at leading-relaxed (1.625) is 19.5px a line.
		const lines = 20;
		const padding = 32; // p-4, top and bottom
		const floorPx = Math.ceil(lines * 12 * 1.625) + padding;
		expect(floorPx).toBeLessThanOrEqual(27 * 16);
		expect(source).toContain('@min-[66rem]:min-h-[27rem] @min-[66rem]:flex-1');
		expect(source).not.toContain('@min-[66rem]:min-h-0 @min-[66rem]:flex-1');
	});

	test('the column that does the dividing is still the fixed-height sticky one', async () => {
		const page = await read('pages/runs/RunsPage.tsx');

		// The floor and the shrink only mean something inside a bounded column; if this ever stops
		// being a fixed viewport height, the metadata block stops needing to give anything up.
		expect(page).toContain('@min-[66rem]:h-[calc(100dvh-3rem)]');
		expect(page).toContain('@min-[66rem]:sticky');
	});

	test('the truncation notice stays two short paragraphs', async () => {
		const notices = await read('pages/runs/LiveConsoleNotices.tsx');

		// It read as larger than the output only because the output was 32px. It is still advisory
		// text and must stay that way — a notice that grows into a block competes with the floor.
		expect(notices).toContain('mb-2 text-xs text-muted-foreground');
		expect((notices.match(/<p /g) ?? []).length).toBe(2);
	});
});
