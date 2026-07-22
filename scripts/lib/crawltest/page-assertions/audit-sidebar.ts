import type { Page } from 'puppeteer';

import { DEFAULT_BASE_URL } from '../../../crawltest-types.ts';

/**
 * Regression test for: audit catalog row selection must not trap sidebar
 * navigation.  After filtering the catalog and clicking a row, clicking a
 * sidebar NavLink must navigate away from /audits without a stranded inert
 * attribute blocking the app shell.
 */
export async function assertAuditSidebarNavigation(
	page: Page,
	route: string,
	baseUrl: string
): Promise<string[]> {
	const errors: string[] = [];
	let pathname = route;
	try {
		pathname = new URL(route, DEFAULT_BASE_URL).pathname;
	} catch {
		// keep raw route
	}
	if (pathname !== '/audits') return errors;

	// 1. Click the Catalog tab (may already be active — click is harmless).
	const clickedCatalog = await page.evaluate(`(() => {
		const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
		const catalog = tabs.find((t) => (t.textContent || '').trim() === 'Catalog');
		if (catalog) { catalog.click(); return true; }
		return false;
	})()`);
	if (!clickedCatalog) {
		errors.push('/audits Catalog tab not found');
		return errors;
	}
	await Bun.sleep(500);

	// 2. Find and click a visible audit row to select it.
	const rowClicked = await page.evaluate(`(() => {
		const rows = Array.from(document.querySelectorAll('tr[class*="cursor-pointer"], button[aria-pressed]'));
		const visible = rows.find((r) => r.offsetWidth > 0);
		if (visible) { visible.click(); return true; }
		return false;
	})()`);
	if (!rowClicked) {
		// No audit rows to click — skip gracefully.
		return errors;
	}
	await Bun.sleep(300);

	// 3. Verify #app-shell has no stranded inert / aria-hidden.
	const shellState = (await page.evaluate(`(() => {
		const shell = document.getElementById('app-shell');
		if (!shell) return { exists: false };
		return {
			exists: true,
			inert: shell.hasAttribute('inert'),
			ariaHidden: shell.getAttribute('aria-hidden'),
		};
	})()`)) as { ariaHidden: null | string; exists: boolean; inert: boolean };

	if (!shellState.exists) {
		errors.push('/audits #app-shell element not found after row selection');
		return errors;
	}
	if (shellState.inert) {
		errors.push('/audits #app-shell has stranded inert attribute after audit row selection');
	}
	if (shellState.ariaHidden === 'true') {
		errors.push('/audits #app-shell has stranded aria-hidden="true" after audit row selection');
	}

	// 4. Click the Skills sidebar NavLink and verify navigation.
	const skillsNavClicked = await page.evaluate(`(() => {
		const links = Array.from(document.querySelectorAll('nav a[href="/skills"]'));
		const link = links[0];
		if (!link) return false;
		link.click();
		return true;
	})()`);
	if (!skillsNavClicked) {
		errors.push('/audits Skills sidebar link not found');
		return errors;
	}
	await Bun.sleep(800);

	const afterSkills = new URL(page.url(), baseUrl).pathname;
	if (afterSkills !== '/skills') {
		errors.push(
			`/audits sidebar navigation stuck on ${afterSkills} after selecting audit row (expected /skills)`
		);
	}

	// 5. Navigate back to /audits and verify the Settings link also works.
	await page.goto(new URL('/audits', baseUrl).toString(), { waitUntil: 'networkidle2' });
	await Bun.sleep(500);

	// Re-select a row.
	await page.evaluate(`(() => {
		const rows = Array.from(document.querySelectorAll('tr[class*="cursor-pointer"], button[aria-pressed]'));
		const visible = rows.find((r) => r.offsetWidth > 0);
		if (visible) visible.click();
	})()`);
	await Bun.sleep(300);

	const settingsNavClicked = await page.evaluate(`(() => {
		const links = Array.from(document.querySelectorAll('nav a[href="/settings"]'));
		const link = links[0];
		if (!link) return false;
		link.click();
		return true;
	})()`);
	if (!settingsNavClicked) {
		errors.push('/audits Settings sidebar link not found');
		return errors;
	}
	await Bun.sleep(800);

	const afterSettings = new URL(page.url(), baseUrl).pathname;
	if (afterSettings !== '/settings') {
		errors.push(
			`/audits sidebar navigation stuck on ${afterSettings} after selecting audit row (expected /settings)`
		);
	}

	// 6. Return to /audits so the rest of the crawl continues from the expected page.
	await page.goto(new URL('/audits', baseUrl).toString(), { waitUntil: 'networkidle2' });
	await Bun.sleep(300);

	return errors;
}
