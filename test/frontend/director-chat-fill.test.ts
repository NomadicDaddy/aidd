import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dir, '../../frontend/src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(SRC, ...segments)).text();
}

/** The Director chat stays useful without claiming the operational queue's viewport. */
describe('the Director chat takes a bounded supporting role', () => {
	test('the card follows its content instead of the viewport', async () => {
		const source = await read('pages/director/DirectorChatSection.tsx');

		expect(source).not.toContain('useViewportFill');
		expect(source).not.toContain('var(--fill-height)');
		expect(source).toContain('<Card className="@container flex min-h-[420px] flex-col">');
		expect(source).toContain(
			'grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 @min-[45rem]:grid-cols-[minmax(14rem,1fr)_minmax(28rem,2fr)] @min-[45rem]:grid-rows-1',
		);
		expect(source).toContain(
			'flex min-w-0 flex-col rounded-md border border-border sm:h-96 @min-[45rem]:h-[28rem]',
		);
		expect(source).toContain('scrollerClassName="space-y-3 p-3 sm:h-full"');
		expect(source).toContain('scrollerRef={transcriptRef}');
	});

	test('the stacked branch shows several sessions and preserves the conversation floor', async () => {
		const source = await read('pages/director/DirectorChatSection.tsx');

		expect(source).toContain('ariaLabel="Director chat sessions"');
		expect(source).toContain(
			'scrollerClassName="max-h-56 space-y-2 @min-[45rem]:h-full @min-[45rem]:max-h-none"',
		);
		expect(source).toContain('flex min-w-0 flex-col rounded-md border border-border sm:h-96');
	});

	test('the transcript is still a live log', async () => {
		const [source, scroller] = await Promise.all([
			read('pages/director/DirectorChatSection.tsx'),
			read('components/shared/OverflowScroller.tsx'),
		]);

		// The bounded conversation remains announced and keyboard-scrollable before the composer.
		expect(source).toContain('ariaLabel="Director chat conversation"');
		expect(source).toContain('ariaLive="polite"');
		expect(source).toContain('role="log"');
		expect(source).toContain('scrollerRef={transcriptRef}');
		expect(scroller).toContain('scroller.tabIndex = 0');
	});

	test('the operational cycle flow receives the wider column', async () => {
		const page = await read('pages/director/DirectorPage.tsx');

		expect(page).toContain(
			'grid items-start gap-5 @min-[68rem]:grid-cols-[minmax(0,3fr)_minmax(28rem,2fr)]',
		);
	});

	test('the bounded chat stays beside the queue while the page scrolls', async () => {
		const source = await read('pages/director/DirectorChatSection.tsx');

		expect(source).toContain('@min-[68rem]:sticky');
		expect(source).toContain('@min-[68rem]:top-5');
	});

	test('the card retains a readable session rail and gives the transcript most of its width', async () => {
		const page = await read('pages/director/DirectorPage.tsx');
		const source = await read('pages/director/DirectorChatSection.tsx');

		// Both thresholds remain container-relative: the page allocates the supporting track, then
		// the card decides whether its own readable rail fits beside the conversation.
		expect(page).toContain('@min-[68rem]:grid-cols-[');
		expect(source).toContain('@min-[45rem]:grid-cols-[minmax(14rem,1fr)_minmax(28rem,2fr)]');
		expect(source).not.toContain('lg:grid-cols-[220px_minmax(0,1fr)]');
		expect(source).not.toContain('xl:grid-cols-[220px_minmax(0,1fr)]');
	});
});
