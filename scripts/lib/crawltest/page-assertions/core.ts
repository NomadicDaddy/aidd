import type { Page } from 'puppeteer';

import { NOT_FOUND_PAGE_MARKER } from 'aidd-shared/contracts/frontend-routes';

import { DEFAULT_BASE_URL } from '../../../crawltest-types.ts';

export function pageTextScript(): string {
	return `(() => document.body ? document.body.innerText : '')()`;
}

export const NOT_FOUND_PAGE_SELECTOR = `[data-aidd-page="${NOT_FOUND_PAGE_MARKER}"]`;

/**
 * Asks Puppeteer to run the selector, rather than building a snippet of JavaScript around it.
 *
 * The previous form interpolated the selector into an evaluated source string and leaned on
 * JSON.stringify to make that safe. JSON.stringify escapes for *data*, not for code — it leaves
 * U+2028/U+2029 and `</script` untouched — so it is not a code sanitizer, which is what CodeQL's
 * js/bad-code-sanitization flags. `page.$` passes the selector across the CDP boundary as an
 * argument, so nothing here is ever parsed as source and the sink is gone rather than suppressed.
 */
export async function isNotFoundPage(page: Page): Promise<boolean> {
	return (await page.$(NOT_FOUND_PAGE_SELECTOR)) !== null;
}

export function classifyPageContent(text: string, isNotFoundPage: boolean) {
	const lowerText = text.toLowerCase();
	return {
		is404Page: isNotFoundPage,
		isErrorPage:
			lowerText.includes('something went wrong') ||
			lowerText.includes('uncaught runtime error'),
	};
}

export function isIgnorableConsoleError(text: string): boolean {
	return (
		text.includes('Cross-Origin-Opener-Policy header has been ignored') &&
		text.includes("URL's origin was untrustworthy")
	);
}

export function isProjectDetailRoute(route: string): boolean {
	try {
		const pathname = new URL(route, DEFAULT_BASE_URL).pathname;
		return /^\/projects\/[^/]+$/.test(pathname);
	} catch {
		return false;
	}
}

export async function assert404(page: Page, baseUrl: string): Promise<string[]> {
	const route = `/crawltest-missing-${Date.now()}`;
	await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'networkidle2' });
	if (!(await isNotFoundPage(page))) {
		return [`${route} did not render the not-found page`];
	}
	return [];
}

export async function clickButtonByText(page: Page, text: string): Promise<boolean> {
	// The needle crosses as a serialised argument rather than being spliced into the source,
	// so nothing here constructs code. Matching stays an exact comparison against the trimmed
	// text, and the click stays an in-page DOM click: a Puppeteer handle click would additionally
	// require the button to be visible and in the viewport, which is a different assertion.
	return page.evaluate((buttonText) => {
		const buttons = Array.from(document.querySelectorAll('button'));
		const button = buttons.find((item) => item.textContent?.trim() === buttonText);
		if (!button) return false;
		button.click();
		return true;
	}, text);
}

export function shouldTestInteractions(route: string): boolean {
	try {
		const pathname = new URL(route, DEFAULT_BASE_URL).pathname;
		return (
			pathname === '/runs' ||
			pathname === '/director' ||
			pathname === '/audits' ||
			pathname === '/recipes' ||
			isProjectDetailRoute(pathname)
		);
	} catch {
		return false;
	}
}
