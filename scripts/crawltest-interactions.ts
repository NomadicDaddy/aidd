import type { ElementHandle, Page } from 'puppeteer';

import type { TestResults } from './crawltest-results.ts';
import type { CrawlerOptions, InteractiveElement } from './crawltest-types.ts';

import { SKIP_PATTERNS, waitForContent } from './crawltest-types.ts';

const MAX_INTERACTIONS_PER_PAGE = 6;

function elementDiscoveryScript(): string {
	return `(() => {
		const elements = [];
		let switchIndex = 0;
		for (const element of document.querySelectorAll('button[role="switch"]:not([disabled])')) {
			elements.push({
				ariaLabel: element.getAttribute('aria-label') || undefined,
				elementId: element.getAttribute('id') || undefined,
				index: switchIndex++,
				text: (element.textContent || '').trim().slice(0, 50),
				type: 'switch',
			});
		}

		let selectIndex = 0;
		for (const element of document.querySelectorAll('button[role="combobox"]:not([disabled]), select:not([disabled])')) {
			elements.push({
				ariaLabel: element.getAttribute('aria-label') || undefined,
				elementId: element.getAttribute('id') || undefined,
				index: selectIndex++,
				text: (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 50),
				type: 'select',
			});
		}

		let buttonIndex = 0;
		for (const element of document.querySelectorAll('button:not([disabled]), [role="tab"]:not([disabled])')) {
			const role = element.getAttribute('role');
			const ariaChecked = element.getAttribute('aria-checked');
			if (role === 'switch' || role === 'combobox') continue;
			if (ariaChecked !== null) continue;

			const text = (element.textContent || '').trim();
			const ariaLabel = element.getAttribute('aria-label') || undefined;
			if (!text && !ariaLabel) continue;

			elements.push({
				ariaLabel,
				elementId: element.getAttribute('id') || undefined,
				index: buttonIndex++,
				text: text.slice(0, 50),
				type: 'button',
			});
		}

		return elements;
	})()`;
}

export async function getInteractiveElements(page: Page): Promise<InteractiveElement[]> {
	const result = await page.evaluate(elementDiscoveryScript());
	return Array.isArray(result) ? (result as InteractiveElement[]) : [];
}

function labelFor(element: InteractiveElement): string {
	return element.text || element.ariaLabel || `${element.type}[${element.index}]`;
}

function shouldSkip(element: InteractiveElement): boolean {
	const label = labelFor(element);
	return SKIP_PATTERNS.some((pattern) => pattern.test(label));
}

async function clickButton(page: Page, element: InteractiveElement): Promise<boolean> {
	const handle = await page.evaluateHandle(
		`(() => {
				const text = ${JSON.stringify(element.text)};
				const ariaLabel = ${JSON.stringify(element.ariaLabel ?? '')};
				const index = ${element.index};
				const candidates = Array.from(document.querySelectorAll('button:not([disabled]), [role="tab"]:not([disabled])'))
					.filter((item) => {
						const role = item.getAttribute('role');
						return role !== 'switch' && role !== 'combobox' && item.getAttribute('aria-checked') === null;
					});
				const visible = (item) => item.getClientRects().length > 0;
				const exact = candidates.find((item) =>
					visible(item) && (
						(text && (item.textContent || '').trim() === text) ||
						(ariaLabel && item.getAttribute('aria-label') === ariaLabel)
					)
				);
				const indexed = candidates[index];
				const target = exact || (indexed && visible(indexed) ? indexed : null);
				return target || null;
			})()`,
	);
	const target = handle.asElement() as ElementHandle<Element> | null;
	if (!target) {
		await handle.dispose();
		return false;
	}

	try {
		await target.click();
		return true;
	} finally {
		await target.dispose();
	}
}

async function testButton(
	page: Page,
	results: TestResults,
	options: CrawlerOptions,
	element: InteractiveElement,
	pageUrl: string,
): Promise<void> {
	const label = labelFor(element);
	const dialogsBefore = Number(
		await page.evaluate(
			`document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]').length`,
		),
	);

	const clicked = await clickButton(page, element);
	if (!clicked) return;

	await Bun.sleep(500);
	const dialogsAfter = Number(
		await page.evaluate(
			`document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]').length`,
		),
	);

	if (dialogsAfter > dialogsBefore) {
		results.dialogsTested++;
		results.addClickedElement(`button "${label}"`, pageUrl, true, 'dialog-trigger');
		await page.keyboard.press('Escape');
		await Bun.sleep(300);
	} else {
		results.addClickedElement(`button "${label}"`, pageUrl, true, 'click');
	}

	if (page.url() !== pageUrl) {
		await page.goto(pageUrl, { timeout: options.timeout, waitUntil: 'domcontentloaded' });
		await waitForContent(page, options.pageSettleDelay);
	}
}

async function testSelect(
	page: Page,
	results: TestResults,
	element: InteractiveElement,
	pageUrl: string,
): Promise<void> {
	const label = labelFor(element);
	await page.evaluate(
		`(() => {
			const text = ${JSON.stringify(element.text)};
			const ariaLabel = ${JSON.stringify(element.ariaLabel ?? '')};
			const index = ${element.index};
			const candidates = Array.from(document.querySelectorAll('button[role="combobox"]:not([disabled]), select:not([disabled])'));
			const exact = candidates.find((item) =>
				(text && (item.textContent || '').trim() === text) ||
				(ariaLabel && item.getAttribute('aria-label') === ariaLabel)
			);
			const target = exact || candidates[index];
			if (target) target.click();
		})()`,
	);
	await Bun.sleep(300);
	await page.keyboard.press('Escape');
	results.selectsTested++;
	results.addClickedElement(`select "${label}"`, pageUrl, true, 'select-open');
}

async function testSwitch(
	page: Page,
	results: TestResults,
	element: InteractiveElement,
	pageUrl: string,
): Promise<void> {
	const label = labelFor(element);
	const result = (await page.evaluate(
		`(() => {
			const elementId = ${JSON.stringify(element.elementId ?? '')};
			const index = ${element.index};
			const switches = Array.from(document.querySelectorAll('button[role="switch"]:not([disabled])'));
			const target = (elementId ? switches.find((item) => item.getAttribute('id') === elementId) : null) || switches[index];
			if (!target) return { found: false, toggled: false };
			const before = target.getAttribute('aria-checked');
			target.click();
			const after = target.getAttribute('aria-checked');
			if (before !== after) target.click();
			return { found: true, toggled: before !== after };
		})()`,
	)) as { found: boolean; toggled: boolean };

	if (!result.found) return;
	results.switchesTested++;
	results.addClickedElement(
		`switch "${label}"`,
		pageUrl,
		result.toggled,
		'switch-toggle',
		result.toggled ? null : 'state did not change',
	);
}

export async function testInteractiveElements(
	page: Page,
	results: TestResults,
	options: CrawlerOptions,
	elements: InteractiveElement[],
	pageUrl: string,
): Promise<void> {
	const tested = new Set<string>();
	let interactionCount = 0;
	for (const element of elements) {
		if (interactionCount >= MAX_INTERACTIONS_PER_PAGE) return;
		if (shouldSkip(element)) continue;

		const key = `${element.type}:${labelFor(element)}`;
		if (tested.has(key)) continue;
		tested.add(key);

		try {
			if (element.type === 'switch') {
				await testSwitch(page, results, element, pageUrl);
			} else if (element.type === 'select') {
				await testSelect(page, results, element, pageUrl);
			} else {
				await testButton(page, results, options, element, pageUrl);
			}
			interactionCount++;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			results.addClickedElement(key, pageUrl, false, element.type, message);
		}

		await Bun.sleep(options.interactionDelay);
	}
}
