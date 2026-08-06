import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('runs page section order', () => {
	async function readRunsPage(): Promise<string> {
		return readFile(
			join(import.meta.dir, '..', '..', 'frontend', 'src', 'pages', 'runs', 'RunsPage.tsx'),
			'utf8',
		);
	}

	test('keeps Live Console between Active and History in narrow source order', async () => {
		const source = await readRunsPage();
		const activeIndex = source.indexOf('title="Active"');
		const consoleIndex = source.indexOf('ref={page.liveConsoleRef}');
		const historyIndex = source.indexOf('title="History"');
		const showMoreIndex = source.indexOf("'Show more'");

		expect(activeIndex).toBeGreaterThan(-1);
		expect(consoleIndex).toBeGreaterThan(activeIndex);
		expect(historyIndex).toBeGreaterThan(consoleIndex);
		// 'Show more' is now the History card's own footer, so it sits inside that card rather
		// than on the page background below it — after the console, before the card's title prop.
		expect(showMoreIndex).toBeGreaterThan(consoleIndex);
		expect(showMoreIndex).toBeLessThan(historyIndex);
	});

	test('places run lists left and a sticky console right at 2xl', async () => {
		const source = await readRunsPage();

		expect(source).toContain('2xl:grid-cols-[minmax(0,2fr)_minmax(24rem,1fr)]');
		expect(source).toContain('2xl:items-start');
		expect(source).toContain('2xl:col-start-1 2xl:row-start-1');
		expect(source).toContain(
			'2xl:sticky 2xl:top-6 2xl:col-start-2 2xl:row-span-2 2xl:row-start-1',
		);
		expect(source).toContain('space-y-3 2xl:col-start-1 2xl:row-start-2');
	});

	test('absorbs console overflow in the second row so the left column cannot shift', async () => {
		const source = await readRunsPage();

		// The console spans both rows. With implicit `auto auto` rows, a console taller than
		// Active+gap+History has its excess split evenly between them, so switching between a
		// pipeline summary and a taller run console moved History down by half the overflow.
		// The flexible second row takes the whole excess instead.
		expect(source).toContain('2xl:grid-rows-[auto_1fr]');
	});
});
