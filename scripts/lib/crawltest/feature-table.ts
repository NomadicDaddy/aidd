import type { Page } from 'puppeteer';

import {
	closeFeatureFilters,
	FEATURE_FILTER_TIMEOUT_MS,
	featureFilterSelect,
	openFeatureFilters,
	resetFeatureFilters,
	setFeatureSearch,
	visibleFeatureControl,
	waitForFeatureSearch,
} from './feature-filter-controls.ts';
import { clickButtonByText, isProjectDetailRoute } from './page-assertions.ts';

interface FeatureFilterOption {
	label: string;
	value: string;
}

interface FeatureFilterOptions {
	source: FeatureFilterOption[];
	status: FeatureFilterOption[];
}

export function filterValueForLabel(
	options: readonly FeatureFilterOption[],
	label: string,
): string {
	return options.find((option) => option.label === label)?.value ?? '';
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

async function featureFilterOptions(page: Page): Promise<FeatureFilterOptions> {
	const script = `(() => {
		const options = (select) => select ? Array.from(select.options).map((option) => ({
			label: option.textContent?.trim() ?? '',
			value: option.value,
		})) : [];
		return {
			source: options(${featureFilterSelect('Source')}),
			status: options(${featureFilterSelect('Status')}),
		};
	})()`;
	return (await page.evaluate(script)) as FeatureFilterOptions;
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
		const rows = Array.from(document.querySelectorAll('table[aria-label="Project features"] tbody tr'));
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
		await waitForFeatureSearch(page);
		await setFeatureSearch(page, 'crawltest-no-feature-match');
		await page.waitForFunction(
			"document.body.innerText.includes('No features match the active filters.')",
			{ timeout: FEATURE_FILTER_TIMEOUT_MS },
		);
		await resetFeatureFilters(page);
		await page.waitForFunction(
			"!document.body.innerText.includes('No features match the active filters.')",
			{ timeout: FEATURE_FILTER_TIMEOUT_MS },
		);

		// A project with no features has nothing for the selects to narrow, and that is the one
		// reason this half may be skipped. Every other give-up below is reported: silently
		// returning is how the selects went unexercised for as long as they did.
		if ((await featureRowCount(page)) === 0) return errors;

		const target = await actionableFeatureFilterTarget(page);
		await openFeatureFilters(page);
		const options = await featureFilterOptions(page);
		const status = target
			? filterValueForLabel(options.status, target.status)
			: options.status.some((option) => option.value === 'completed')
				? 'completed'
				: '';
		// Without a row to copy from, prefer the "__all_*" aggregate over a specific source label.
		// A label narrows to one category and can empty the table, and an empty table is not a
		// finding here; the aggregates still exclude the other two categories, so the filter is
		// genuinely exercised either way.
		const source = target
			? filterValueForLabel(options.source, target.source)
			: (
					options.source.find((option) => option.value.startsWith('__all_')) ??
					options.source.find((option) => option.value !== 'all')
				)?.value;
		if (
			!options.status.some((option) => option.value === status) ||
			!source ||
			!options.source.some((option) => option.value === source)
		) {
			errors.push(
				`${route} feature filters could not be exercised: wanted status ${JSON.stringify(status)} ` +
					`and source ${JSON.stringify(source)}, offered ${JSON.stringify(options)}`,
			);
			return errors;
		}

		await selectFeatureFilter(page, 'Status', status);
		await page.waitForFunction("new URLSearchParams(location.search).has('featureStatus')", {
			timeout: FEATURE_FILTER_TIMEOUT_MS,
		});
		await selectFeatureFilter(page, 'Source', source);
		await page.waitForFunction("new URLSearchParams(location.search).has('featureSource')", {
			timeout: FEATURE_FILTER_TIMEOUT_MS,
		});
		await closeFeatureFilters(page);
		await page.waitForFunction(
			"new URLSearchParams(location.search).has('featureStatus') && new URLSearchParams(location.search).has('featureSource')",
			{ timeout: FEATURE_FILTER_TIMEOUT_MS },
		);
		const controlsVisible = target
			? Boolean(
					await page.evaluate(`(() => {
						return [
						'select[aria-label^="Status for"]',
						'button[aria-label^="Approve "]',
						'button[aria-label^="Delete "]',
						].some((selector) => Array.from(document.querySelectorAll(selector))
							.some(${visibleFeatureControl}));
					})()`),
				)
			: true;
		if (!controlsVisible) {
			errors.push(`${route} feature filters hid all row mutation controls`);
		}
		await resetFeatureFilters(page);
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
		await waitForFeatureSearch(page);
		const result = (await page.evaluate(`(() => {
			const table = document.querySelector('table[aria-label="Project features"]');
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
