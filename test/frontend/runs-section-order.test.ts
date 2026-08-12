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

	async function readWorkspaceTabs(): Promise<string> {
		return readFile(
			join(
				import.meta.dir,
				'..',
				'..',
				'frontend',
				'src',
				'pages',
				'runs',
				'RunsPanelTabs.tsx',
			),
			'utf8',
		);
	}

	test('keeps Live Console between Active and History in narrow source order', async () => {
		const source = await readRunsPage();
		const activeIndex = source.indexOf('title="Active"');
		const consoleIndex = source.indexOf('ref={liveConsoleRef}');
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

	test('places run lists left and a sticky console right once the region is wide enough', async () => {
		const source = await readRunsPage();

		// The step is the region's own width, not the window's. History's 56rem table, the
		// console's 24rem floor, and the 1.25rem gap require 81.25rem before they may split.
		expect(source).toContain('@min-[81.25rem]:grid-cols-[minmax(0,2fr)_minmax(24rem,1fr)]');
		expect(source).toContain('@min-[81.25rem]:items-start');
		expect(source).toContain('@min-[81.25rem]:col-start-1 @min-[81.25rem]:row-start-1');
		expect(source).toContain(
			'@min-[81.25rem]:sticky @min-[81.25rem]:top-6 @min-[81.25rem]:col-start-2 @min-[81.25rem]:row-span-2 @min-[81.25rem]:row-start-1',
		);
		expect(source).toContain(
			'space-y-3 @min-[81.25rem]:col-start-1 @min-[81.25rem]:row-start-2',
		);
		expect(source).not.toContain('@min-[66rem]');
	});

	test('absorbs console overflow in the second row so the left column cannot shift', async () => {
		const source = await readRunsPage();

		// The console spans both rows. With implicit `auto auto` rows, a console taller than
		// Active+gap+History has its excess split evenly between them, so switching between a
		// pipeline summary and a taller run console moved History down by half the overflow.
		// The flexible second row takes the whole excess instead.
		expect(source).toContain('@min-[81.25rem]:grid-rows-[auto_1fr]');
	});

	test('uses canonical mobile tabs with one workspace panel in flow', async () => {
		const source = await readRunsPage();
		const tabs = await readWorkspaceTabs();

		expect(tabs).toContain('<TabList');
		expect(tabs).toContain('ariaLabel="Run panels"');
		expect(tabs).toContain('className="sm:hidden"');
		expect(tabs).toContain('aria-label="Selection active"');
		for (const panel of ['active', 'console', 'history']) {
			expect(source).toContain(`tabPanelId(RUNS_PANEL_ID, '${panel}')`);
			expect(source).toContain(`mobilePanel === '${panel}' ? 'block' : 'hidden sm:block'`);
		}
	});

	test('activates and focuses the mobile Console panel after a row selection', async () => {
		const source = await readRunsPage();

		expect(source).toContain("window.matchMedia('(max-width: 639px)').matches");
		expect(source).toContain("setMobilePanel('console')");
		expect(source).toContain('focusConsoleAfterActivationRef.current = true');
		expect(source).toContain("mobilePanel !== 'console'");
		expect(source).toContain('node.focus({ preventScroll: true })');
		expect(source).toContain('onSelectRun: (id) => selectConsoleTarget');
		expect(source).toContain('onSelectStepRun: (sessionId, runId) =>');
	});
});
