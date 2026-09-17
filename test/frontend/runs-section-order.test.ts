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
		const paginationIndex = source.indexOf('<Pagination');

		expect(activeIndex).toBeGreaterThan(-1);
		expect(consoleIndex).toBeGreaterThan(activeIndex);
		expect(historyIndex).toBeGreaterThan(consoleIndex);
		// Pagination is the History card's own footer, so it sits inside that card rather than on
		// the page background below it — after the console, before the card's title prop.
		expect(paginationIndex).toBeGreaterThan(consoleIndex);
		expect(paginationIndex).toBeLessThan(historyIndex);
		expect(source).not.toContain("'Show more'");
	});

	test('places run lists left and a sticky console right once the region is wide enough', async () => {
		const source = await readRunsPage();

		// The step is the region's own width, not the window's. History's 63rem table plus the
		// Card's 2px border, the console's 24rem floor, and the 1.25rem gap require 88.375rem.
		expect(source).toContain(
			'@min-[88.375rem]:grid-cols-[minmax(63.125rem,2fr)_minmax(24rem,1fr)]',
		);
		expect(source).toContain(
			'@min-[100rem]:grid-cols-[minmax(63.125rem,1.4fr)_minmax(24rem,1fr)]',
		);
		expect(source).toContain('@min-[88.375rem]:items-start');
		expect(source).toContain('@min-[88.375rem]:col-start-1 @min-[88.375rem]:row-start-1');
		expect(source).toContain(
			'@min-[88.375rem]:sticky @min-[88.375rem]:top-6 @min-[88.375rem]:col-start-2 @min-[88.375rem]:row-span-2 @min-[88.375rem]:row-start-1',
		);
		expect(source).toContain(
			'space-y-3 @min-[88.375rem]:col-start-1 @min-[88.375rem]:row-start-2',
		);
		expect(source).not.toContain('@min-[66rem]');
	});

	test('absorbs console overflow in the second row so the left column cannot shift', async () => {
		const source = await readRunsPage();

		// The console spans both rows. With implicit `auto auto` rows, a console taller than
		// Active+gap+History has its excess split evenly between them, so switching between a
		// pipeline summary and a taller run console moved History down by half the overflow.
		// The flexible second row takes the whole excess instead.
		expect(source).toContain('@min-[88.375rem]:grid-rows-[auto_minmax(0,1fr)]');
	});

	test('publishes one measured viewport budget without imposing it on History', async () => {
		const page = await readRunsPage();
		const table = await readFile(
			join(
				import.meta.dir,
				'..',
				'..',
				'frontend',
				'src',
				'pages',
				'runs',
				'UnifiedExecutionTable.tsx',
			),
			'utf8',
		);

		// The grid measures the remaining viewport and publishes it; custom properties inherit,
		// so the sticky console column can resolve it without the grid being a fixed-height box.
		// Binding History to the same budget cost the reader rows as the window grew — every row
		// visible at 1440x900, a fraction of them at 2250x1309 — so History stays in page flow.
		expect(page).toContain('useViewportFill<HTMLDivElement>');
		expect(page).toContain('ref={runsViewportRef}');
		expect(page).toContain('@min-[88.375rem]:h-[var(--fill-height)]');
		expect(page).not.toContain('@min-[88.375rem]:self-stretch');
		expect(page).not.toContain('100dvh');
		expect(table).not.toContain('var(--fill-height)');
		expect(table).not.toContain('@min-[88.375rem]:flex-1');
		expect(table).not.toContain('max-h-[calc(100dvh-22rem)]');
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
