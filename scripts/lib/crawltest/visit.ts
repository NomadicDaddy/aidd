import type { Page } from 'puppeteer';

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { type TestResults } from '../../crawltest-results.ts';
import { screenshotFilename } from '../../crawltest-screenshots.ts';
import { type CrawlerOptions, type ViewportArg, waitForContent } from '../../crawltest-types.ts';
import { classifyPageContent, isNotFoundPage, pageTextScript } from './page-assertions.ts';

function linksScript(): string {
	return `(() => Array.from(document.querySelectorAll('a[href]')).map((link) => link.href))()`;
}

function routeFromHref(baseUrl: string, href: string): null | string {
	try {
		const base = new URL(baseUrl);
		const url = new URL(href, base);
		if (url.origin !== base.origin) return null;
		if (url.pathname.startsWith('/api/')) return null;
		if (/^\/projects\/[^/]+$/.test(url.pathname)) return null;
		if (/^\/recipes\/[^/]+$/.test(url.pathname)) return null;
		if (/^\/pipeline-sessions\/[^/]+$/.test(url.pathname)) return null;
		return `${url.pathname}${url.search}`;
	} catch {
		return null;
	}
}

async function screenshot(
	page: Page,
	directory: string,
	route: string,
	viewport: ViewportArg
): Promise<boolean> {
	await mkdir(directory, { recursive: true });
	await page.screenshot({
		fullPage: true,
		path: join(directory, screenshotFilename(route, viewport)),
	});
	return true;
}

function overflowScript(): string {
	return `(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		innerWidth: window.innerWidth,
	}))()`;
}

export async function visitRoute(
	page: Page,
	baseUrl: string,
	route: string,
	screenshotDirectory: string,
	shouldScreenshot: boolean,
	viewport: ViewportArg,
	checkOverflow: boolean,
	results: TestResults,
	options: CrawlerOptions
): Promise<{ errors: string[]; links: string[] }> {
	const errors: string[] = [];
	const url = new URL(route, baseUrl).toString();
	results.visitedUrls.add(url);
	let response: Awaited<ReturnType<Page['goto']>>;
	try {
		response = await page.goto(url, {
			timeout: options.timeout,
			waitUntil: 'networkidle2',
		});
	} catch (err) {
		const message = `${route} navigation failed: ${
			err instanceof Error ? err.message : String(err)
		}`;
		errors.push(message);
		results.addError('VISIT_ERROR', message, { route, url });
		try {
			if (await screenshot(page, screenshotDirectory, route, viewport)) {
				results.screenshotsTaken++;
			}
		} catch {
			// The page may be in a bad state after a navigation timeout.
		}
		return { errors, links: [] };
	}
	await waitForContent(page, options.pageSettleDelay);

	if (!response) {
		const message = `${route} did not return a response`;
		errors.push(message);
		results.addError('VISIT_ERROR', message, { route, url });
	} else if (response.status() >= 500) {
		const message = `${route} returned ${response.status()}`;
		errors.push(message);
		results.addNetworkError(url, response.status(), response.statusText());
	}

	let text = String(await page.evaluate(pageTextScript()));
	if (text.trim().length < 10) {
		await page.reload({ timeout: options.timeout, waitUntil: 'networkidle2' });
		await waitForContent(page, options.pageSettleDelay);
		text = String(await page.evaluate(pageTextScript()));
	}

	const classification = classifyPageContent(text, await isNotFoundPage(page));
	const contentEntry = {
		hasContent: text.trim().length >= options.contentMinLength,
		hasHeading: Boolean(await page.evaluate(`document.querySelector('h1, h2') !== null`)),
		...classification,
		textLength: text.trim().length,
		timestamp: new Date().toISOString(),
		url,
	};
	results.addContentAssertion(contentEntry);

	if (text.trim().length < 10) {
		const message = `${route} rendered blank or near-blank content`;
		errors.push(message);
		results.addError('CONTENT_ERROR', message, { route, textLength: text.trim().length });
	} else if (!contentEntry.hasContent) {
		const message = `${route} rendered insufficient content (${contentEntry.textLength} chars)`;
		errors.push(message);
		results.addError('CONTENT_ERROR', message, { route, textLength: text.trim().length });
	} else if (contentEntry.isErrorPage) {
		const message = `${route} rendered an error page`;
		errors.push(message);
		results.addError('CONTENT_ERROR', message, { route });
	} else if (contentEntry.is404Page) {
		const message = `${route} rendered a 404 page`;
		errors.push(message);
		results.addError('CONTENT_ERROR', message, { route });
	}

	if (checkOverflow) {
		const overflow = (await page.evaluate(overflowScript())) as {
			innerWidth: number;
			scrollWidth: number;
		};
		if (overflow.scrollWidth > overflow.innerWidth + 1) {
			const message = `overflow: ${route} has horizontal scroll (scrollWidth=${overflow.scrollWidth}, innerWidth=${overflow.innerWidth})`;
			errors.push(message);
			results.addError('OVERFLOW', message, overflow);
		}
	}

	const rawLinksResult = await page.evaluate(linksScript());
	const rawLinks = Array.isArray(rawLinksResult)
		? rawLinksResult.filter((href): href is string => typeof href === 'string')
		: [];
	const links = rawLinks
		.map((href) => routeFromHref(baseUrl, href))
		.filter((href): href is string => href !== null);

	if (shouldScreenshot || errors.length > 0) {
		if (await screenshot(page, screenshotDirectory, route, viewport)) {
			results.screenshotsTaken++;
		}
	}

	return { errors, links };
}
