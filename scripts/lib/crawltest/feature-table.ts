import type { Page } from 'puppeteer';

import { clickButtonByText, isProjectDetailRoute } from './page-assertions.ts';

async function setInputValue(page: Page, selector: string, value: string): Promise<void> {
	await page.click(selector);
	await page.keyboard.down('Control');
	await page.keyboard.press('A');
	await page.keyboard.up('Control');
	await page.keyboard.press('Backspace');
	await page.keyboard.type(value);
}

/**
 * A JS expression resolving the Features toolbar select carrying `label`, or null.
 *
 * These were addressed as `document.querySelectorAll('select')[n]`, which is document order across
 * the whole page rather than position within the toolbar. Index 0 is the tab picker the detail
 * page renders above the filters, so the status read came back as `["overview", "features", …]`,
 * never contained a feature status, and every caller below took its give-up branch: half of this
 * check read as if it exercised the selects and never touched them.
 *
 * The anchor is the search field, which is the one control in the toolbar with a unique selector.
 * The desktop controls are nested in the toolbar's responsive `display: contents` wrapper. Search
 * the grid's descendant `FieldRow` labels rather than its direct children: CSS flattens that
 * wrapper visually, but the DOM does not. Anchoring on the grid still prevents this from reaching
 * a row-level status select or another tab's controls.
 */
function featureFilterSelect(label: string): string {
	return `(() => {
		const search = document.querySelector('input[placeholder="Filter by feature metadata"]');
		const grid = search?.closest('label')?.parentElement;
		if (!grid) return null;
		const field = Array.from(grid.querySelectorAll('label')).find(
			(field) => field.querySelector(':scope > span')?.textContent?.trim() === ${JSON.stringify(label)},
		);
		return field?.querySelector('select') ?? null;
	})()`;
}

async function selectFeatureFilter(page: Page, label: string, value: string): Promise<void> {
	const script = `(() => {
		const select = ${featureFilterSelect(label)};
		if (!select) throw new Error('Feature ' + ${JSON.stringify(label)} + ' filter select was not found');
		select.value = ${JSON.stringify(value)};
		select.dispatchEvent(new Event('change', { bubbles: true }));
	})()`;
	await page.evaluate(script);
}

async function featureFilterOptions(page: Page): Promise<{ source: string[]; status: string[] }> {
	const script = `(() => {
		const values = (select) => select ? Array.from(select.options).map((option) => option.value) : [];
		return {
			source: values(${featureFilterSelect('Source')}),
			status: values(${featureFilterSelect('Status')}),
		};
	})()`;
	return (await page.evaluate(script)) as { source: string[]; status: string[] };
}

/** How many feature rows the table holds. Zero means there is nothing for the filters to act on. */
async function featureRowCount(page: Page): Promise<number> {
	return (await page.evaluate(
		'document.querySelectorAll(\'table[aria-label="Project features"] tbody tr\').length',
	)) as number;
}

async function actionableFeatureFilterTarget(
	page: Page,
): Promise<{ source: string; status: string } | null> {
	const script = `(() => {
		const rows = Array.from(document.querySelectorAll('tbody tr'));
		for (const row of rows) {
			const cells = Array.from(row.querySelectorAll('td'));
			const status = cells[1]?.textContent?.trim() ?? '';
			const source = cells[5]?.textContent?.trim() ?? '';
			const hasControls =
				row.querySelector('select[aria-label^="Status for"]') !== null ||
				row.querySelector('button[aria-label^="Approve "]') !== null ||
				row.querySelector('button[aria-label^="Delete "]') !== null;
			if (status && source && hasControls) return { source, status };
		}
		return null;
	})()`;
	return (await page.evaluate(script)) as { source: string; status: string } | null;
}

export async function assertProjectFeatureFilters(page: Page, route: string): Promise<string[]> {
	if (!isProjectDetailRoute(route)) return [];
	const errors: string[] = [];
	const opened = await clickButtonByText(page, 'Features');
	if (!opened) return errors;

	try {
		await page.waitForSelector('input[placeholder="Filter by feature metadata"]', {
			timeout: 5_000,
		});
		await setInputValue(
			page,
			'input[placeholder="Filter by feature metadata"]',
			'crawltest-no-feature-match',
		);
		await page.waitForFunction(
			"document.body.innerText.includes('No features match the active filters.')",
			{ timeout: 5_000 },
		);
		await clickButtonByText(page, 'Reset filters');
		await page.waitForFunction(
			"!document.body.innerText.includes('No features match the active filters.')",
			{ timeout: 5_000 },
		);

		// A project with no features has nothing for the selects to narrow, and that is the one
		// reason this half may be skipped. Every other give-up below is reported: silently
		// returning is how the selects went unexercised for as long as they did.
		if ((await featureRowCount(page)) === 0) return errors;

		const target = await actionableFeatureFilterTarget(page);
		const options = await featureFilterOptions(page);
		const status = target?.status ?? (options.status.includes('completed') ? 'completed' : '');
		// Without a row to copy from, prefer the "__all_*" aggregate over a specific source label.
		// A label narrows to one category and can empty the table, and an empty table is not a
		// finding here; the aggregates still exclude the other two categories, so the filter is
		// genuinely exercised either way.
		const source =
			target?.source ??
			(options.source.find((value) => value.startsWith('__all_')) ||
				options.source.find((value) => value !== 'all'));
		if (!options.status.includes(status) || !source || !options.source.includes(source)) {
			errors.push(
				`${route} feature filters could not be exercised: wanted status ${JSON.stringify(status)} ` +
					`and source ${JSON.stringify(source)}, offered ${JSON.stringify(options)}`,
			);
			return errors;
		}

		await selectFeatureFilter(page, 'Status', status);
		await selectFeatureFilter(page, 'Source', source);
		await page.waitForFunction(
			"new URLSearchParams(location.search).has('featureStatus') && new URLSearchParams(location.search).has('featureSource')",
			{ timeout: 5_000 },
		);
		const controlsVisible = target
			? Boolean(
					await page.evaluate(`(() => {
						return [
						'select[aria-label^="Status for"]',
						'button[aria-label^="Approve "]',
						'button[aria-label^="Delete "]',
						].some((selector) => document.querySelector(selector) !== null);
					})()`),
				)
			: true;
		if (!controlsVisible) {
			errors.push(`${route} feature filters hid all row mutation controls`);
		}
		await clickButtonByText(page, 'Reset filters');
	} catch (err) {
		errors.push(
			`${route} project feature filter checks failed: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
	}
	return errors;
}

export async function assertProjectFeaturesActionsAffordance(
	page: Page,
	route: string,
): Promise<string[]> {
	if (!isProjectDetailRoute(route)) return [];
	const errors: string[] = [];
	const opened = await clickButtonByText(page, 'Features');
	if (!opened) return errors;

	try {
		await page.waitForSelector('input[placeholder="Filter by feature metadata"]', {
			timeout: 5_000,
		});
		const result = (await page.evaluate(`(() => {
			const table = document.querySelector('tbody')?.closest('table');
			if (!table) return { skipped: true, problems: [] };
			// The features table is the desktop form of a surface that becomes a card list below xl,
			// and the hidden half stays in the DOM. Measuring it there reports every control as
			// zero-sized, which is a fact about the viewport rather than about the Actions column.
			if (table.offsetWidth <= 0 || table.offsetHeight <= 0) {
				return { skipped: true, problems: [] };
			}
			const headers = Array.from(table.querySelectorAll('thead th'));
			const actionsHeader = headers[headers.length - 1];
			const problems = [];
			if (!actionsHeader || actionsHeader.textContent?.trim() !== 'Actions') {
				problems.push('Actions header text was not "Actions"');
				return { skipped: false, problems };
			}
			if (getComputedStyle(actionsHeader).whiteSpace !== 'nowrap') {
				problems.push('Actions header is not whitespace-nowrap and can clip');
			}
			if (actionsHeader.scrollWidth > actionsHeader.clientWidth + 1) {
				problems.push('Actions header is visually clipped within its cell');
			}
			const rows = Array.from(table.querySelectorAll('tbody tr'));
			for (const row of rows) {
				const lastCell = row.querySelector('td:last-child');
				if (!lastCell) continue;
				const hasMutation = lastCell.querySelector(
					'select[aria-label^="Status for"], button[aria-label^="Approve "], button[aria-label^="Delete "]'
				);
				if (hasMutation) continue;
				const detailsButton = lastCell.querySelector(
					'button[aria-label^="View details for"]'
				);
				if (!detailsButton) {
					problems.push('A read-only feature row has no visible details control');
					break;
				}
				if (detailsButton.offsetWidth <= 0 || detailsButton.offsetHeight <= 0) {
					problems.push('Read-only feature row details control is not visible');
					break;
				}
				const minWidth = Number.parseFloat(getComputedStyle(lastCell).minWidth);
				if (Number.isFinite(minWidth) && minWidth >= 200) {
					problems.push('Actions column reserves excessive empty space');
					break;
				}
			}
			return { skipped: false, problems };
		})()`)) as { problems: string[]; skipped: boolean };
		if (!result.skipped) {
			for (const problem of result.problems) {
				errors.push(`${route} ${problem}`);
			}
		}
	} catch (err) {
		errors.push(
			`${route} project feature actions affordance check failed: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
	}
	return errors;
}
