import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dir, '../../frontend/src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(SRC, ...segments)).text();
}

/**
 * The Director page is a two-column grid, and a grid stretches its items — so the chat column was
 * already 867px tall. The card inside it was 512px, because nothing between the grid item and the
 * transcript passed the height down: 355px of bare page background sat under a panel whose
 * transcript was simultaneously squeezed to a 420px minimum holding one short message.
 */
describe('the Director chat fills the column it was given', () => {
	test('the height reaches the transcript, one element at a time', async () => {
		const source = await read('pages/director/DirectorChatSection.tsx');

		// A break anywhere in this chain puts the background back. The section stretches as a grid
		// item, the Card fills the section, the inner grid takes the Card's remaining height, and
		// the transcript column is a grid item that stretches into it.
		expect(source).toContain(
			'<section aria-labelledby="director-chat-heading" className="h-full">',
		);
		expect(source).toContain('<Card className="flex h-full min-h-[420px] flex-col">');
		expect(source).toContain('grid min-h-0 flex-1 gap-3 xl:grid-cols-[220px_minmax(0,1fr)]');
		expect(source).toContain('flex min-h-0 min-w-0 flex-col rounded-md border border-border');
		expect(source).toContain('min-h-0 flex-1 space-y-3 overflow-y-auto p-3');
	});

	test('the floor moved off the inner grid, without being dropped', async () => {
		const source = await read('pages/director/DirectorChatSection.tsx');

		// It cannot stay on the grid: a minimum height there is also what stopped the grid from
		// taking the Card's full height. It cannot simply go, either — below `lg` the page is one
		// column and the row is content-sized, so `h-full` has nothing to fill.
		expect(source).not.toContain('grid min-h-[420px]');
		expect(source).toContain('min-h-[420px]');
	});

	test('the reclaimed height goes to the transcript, not to the session rail', async () => {
		const source = await read('pages/director/DirectorChatSection.tsx');

		// The rail is the shorter column and would otherwise grow a five-chat list into a
		// full-height stack of cards beside a transcript that gained nothing.
		expect(source).toContain('min-h-0 flex-1 space-y-2 overflow-y-auto');
	});

	test('the transcript is still a live log', async () => {
		const source = await read('pages/director/DirectorChatSection.tsx');

		// A layout change that silently drops the live region turns a growing transcript into one
		// nothing announces.
		expect(source).toContain('aria-live="polite"');
		expect(source).toContain('role="log"');
	});

	test('the column it stretches against is the one holding the cycles', async () => {
		const page = await read('pages/director/DirectorPage.tsx');

		// `h-full` on the chat is only meaningful while its sibling is the tall one; if the page
		// ever stops being a stretched two-column grid, this fix stops meaning anything.
		expect(page).toContain('grid gap-5 lg:grid-cols-2');
	});

	test('the session rail waits a breakpoint past the one that halves the card', async () => {
		const page = await read('pages/director/DirectorPage.tsx');
		const source = await read('pages/director/DirectorChatSection.tsx');

		// The page halves at `lg`, so a rail that also splits at `lg` claims 220 of the card's 358
		// on the exact width the card first has to share. The transcript came out 92px and the
		// composer needed 130px in 90. Below `xl` the rail stacks; at 1280 the card is 486 and the
		// two columns are 220 each.
		expect(page).toContain('lg:grid-cols-2');
		expect(source).toContain('xl:grid-cols-[220px_minmax(0,1fr)]');
		expect(source).not.toContain('lg:grid-cols-[220px_minmax(0,1fr)]');
	});
});
