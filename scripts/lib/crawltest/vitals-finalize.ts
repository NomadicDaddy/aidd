import type { Page } from 'puppeteer';

/**
 * Make the document report itself hidden and fire `visibilitychange`.
 *
 * web-vitals finalizes CLS and INP from an `onHidden` handler that checks
 * `document.visibilityState`, so a crawl that only ever navigates away collects neither: the
 * report the audit examined had a single CLS sample and no INP samples at all. Overriding the
 * accessor on the document instance (the prototype getter stays intact underneath) is enough to
 * satisfy that check without closing or backgrounding the page.
 */
export const HIDE_DOCUMENT_SCRIPT = `(() => {
	Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
	Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
	document.dispatchEvent(new Event('visibilitychange'));
	return true;
})()`;

/** Drop the overrides so the page keeps behaving normally for the assertions that follow. */
export const RESTORE_DOCUMENT_SCRIPT = `(() => {
	delete document.visibilityState;
	delete document.hidden;
	document.dispatchEvent(new Event('visibilitychange'));
	return true;
})()`;

/** Long enough for the observer callbacks to run and their console messages to reach the crawler. */
const SETTLE_MS = 250;

/**
 * Produce the interaction and lifecycle events a route's INP and CLS measurements need.
 *
 * The keypress is a Tab: it moves focus and nothing else, so it yields an event-timing entry on
 * every route — including read-only ones — without activating a control. Best-effort throughout; a
 * page that cannot be finalized still contributes the metrics it already reported.
 * @param page The page sitting on the route being finished.
 * @param settleMs Override for the settle delay.
 */
export async function finalizeRouteVitals(page: Page, settleMs: number = SETTLE_MS): Promise<void> {
	try {
		await page.keyboard.press('Tab');
		await Bun.sleep(settleMs);
		await page.evaluate(HIDE_DOCUMENT_SCRIPT);
		await Bun.sleep(settleMs);
		await page.evaluate(RESTORE_DOCUMENT_SCRIPT);
	} catch {
		// A navigated-away or crashed page has nothing left to finalize.
	}
}
