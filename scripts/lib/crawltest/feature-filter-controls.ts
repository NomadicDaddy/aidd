import type { Page } from 'puppeteer';

export const FEATURE_FILTER_TIMEOUT_MS = 10_000;
export const visibleFeatureControl = `(element) => element instanceof HTMLElement &&
	element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible'`;
export const featureSearch = `Array.from(document.querySelectorAll(
	'input[placeholder="Filter by feature metadata"]'
)).find(${visibleFeatureControl})`;

// The search exists twice. Its visible copy anchors the same Card at every breakpoint,
// regardless of the mobile wrapper or desktop display:contents wrapper between them.
const featureToolbar = `(${featureSearch})?.closest('[data-content-rail]')`;
const mobilePanel = `(() => {
	const toolbar = ${featureToolbar};
	const trigger = Array.from(toolbar?.querySelectorAll('button[aria-haspopup="dialog"]') ?? [])
		.find(${visibleFeatureControl});
	return document.getElementById(trigger?.getAttribute('aria-controls') ?? '');
})()`;

export function featureFilterSelect(label: string): string {
	return `(() => {
		const panel = ${mobilePanel};
		const scope = panel && (${visibleFeatureControl})(panel) ? panel : ${featureToolbar};
		for (const field of scope?.querySelectorAll('label[for]') ?? []) {
			if (field.textContent?.trim() !== ${JSON.stringify(label)}) continue;
			const control = document.getElementById(field.htmlFor);
			if (control instanceof HTMLSelectElement && (${visibleFeatureControl})(control)) return control;
		}
		return null;
	})()`;
}

export async function waitForFeatureSearch(page: Page): Promise<void> {
	await page.waitForFunction(`Boolean(${featureSearch})`, {
		timeout: FEATURE_FILTER_TIMEOUT_MS,
	});
}

export async function setFeatureSearch(page: Page, value: string): Promise<void> {
	const handle = await page.evaluateHandle(`(${featureSearch}) ?? null`);
	try {
		const input = handle.asElement();
		if (!input) throw new Error('Visible feature search was not found');
		await (await input.toElement('input')).click();
		await page.keyboard.down('Control');
		await page.keyboard.press('A');
		await page.keyboard.up('Control');
		await page.keyboard.press('Backspace');
		await page.keyboard.type(value);
	} finally {
		await handle.dispose();
	}
}

export async function openFeatureFilters(page: Page): Promise<void> {
	if (await page.evaluate(`Boolean(${featureFilterSelect('Status')})`)) return;
	await page.evaluate(`(() => {
		const toolbar = ${featureToolbar};
		const trigger = Array.from(toolbar?.querySelectorAll('button[aria-haspopup="dialog"]') ?? [])
			.find(${visibleFeatureControl});
		if (!trigger) throw new Error('Visible feature Filters trigger was not found');
		trigger.click();
	})()`);
	await page.waitForFunction(`Boolean(${featureFilterSelect('Status')})`, {
		timeout: FEATURE_FILTER_TIMEOUT_MS,
	});
}

export async function closeFeatureFilters(page: Page): Promise<void> {
	await page.evaluate(`(() => {
		const panel = ${mobilePanel};
		if (!panel || !(${visibleFeatureControl})(panel)) return;
		const button = Array.from(panel.querySelectorAll('button')).find(
			(item) => item.textContent?.trim() === 'Show results' && (${visibleFeatureControl})(item),
		);
		if (!button) throw new Error('Visible feature Show results button was not found');
		button.click();
	})()`);
	await page.waitForFunction(`!(${mobilePanel})`, { timeout: FEATURE_FILTER_TIMEOUT_MS });
}

export async function resetFeatureFilters(page: Page): Promise<void> {
	await closeFeatureFilters(page);
	await page.evaluate(`(() => {
		const toolbar = ${featureToolbar};
		const button = Array.from(toolbar?.querySelectorAll('button') ?? []).find(
			(item) => (item.getAttribute('aria-label') === 'Reset filters' ||
				item.textContent?.trim() === 'Reset filters') && (${visibleFeatureControl})(item),
		);
		if (!button || button.disabled) throw new Error('Enabled visible feature Reset filters button was not found');
		button.click();
	})()`);
	await page.waitForFunction(
		`(() => {
		const search = ${featureSearch};
		const params = new URLSearchParams(location.search);
		return search?.value === '' && !Array.from(params.keys()).some((key) =>
			['featureQ', 'featureStatus', 'featureSource', 'featurePriority', 'featureMilestone'].includes(key));
	})()`,
		{ timeout: FEATURE_FILTER_TIMEOUT_MS },
	);
}
