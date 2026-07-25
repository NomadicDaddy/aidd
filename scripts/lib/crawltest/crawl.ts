import { join } from 'node:path';
import process from 'node:process';
import puppeteer, { type Browser } from 'puppeteer';

import { normalizeRoute, resolveCrawlArgs } from '../../crawltest-config.ts';
import { getInteractiveElements, testInteractiveElements } from '../../crawltest-interactions.ts';
import { printReport, writeCrawlReport } from '../../crawltest-reporting.ts';
import { TestResults } from '../../crawltest-results.ts';
import { getVersionedScreenshotDir } from '../../crawltest-screenshots.ts';
import {
	MOBILE_VIEWPORT_NAMES,
	MOBILE_VIEWPORT_PRESETS,
	type CrawlArgs,
	type CrawlerOptions,
	type ViewportArg,
} from '../../crawltest-types.ts';
import {
	assertProjectFeatureFilters,
	assertProjectFeaturesActionsAffordance,
} from './feature-table.ts';
import { assertLocalNetworkAccess } from './local-network.ts';
import {
	assert404,
	assertAuditSidebarNavigation,
	assertDisabledActionAffordance,
	isIgnorableConsoleError,
	parseWebVitalMessage,
	shouldTestInteractions,
} from './page-assertions.ts';
import { fileBugThroughUi, initialRoutes, resolveBugProject } from './projects.ts';
import { visitRoute } from './visit.ts';

interface CrawlResult {
	errors: string[];
	visited: string[];
}

async function crawl(
	browser: Browser,
	args: CrawlArgs,
	viewportName: ViewportArg,
	results: TestResults
): Promise<CrawlResult> {
	const page = await browser.newPage();
	await page.evaluateOnNewDocument(
		`(() => {
			try {
				window.localStorage.setItem('aidd:crawltest', '1');
			} catch {}
		})()`
	);
	const preset = MOBILE_VIEWPORT_PRESETS[viewportName];
	if (preset) {
		await page.setViewport({
			deviceScaleFactor: preset.deviceScaleFactor,
			hasTouch: preset.hasTouch,
			height: preset.height,
			isMobile: preset.isMobile,
			width: preset.width,
		});
		await page.setUserAgent(preset.userAgent);
	}

	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];
	page.on('pageerror', (error) =>
		pageErrors.push(error instanceof Error ? error.message : String(error))
	);
	page.on('console', (message) => {
		const text = message.text();
		const webVital = parseWebVitalMessage(text, page.url());
		if (webVital) {
			results.addWebVital(webVital);
			return;
		}
		if (message.type() === 'error' && !isIgnorableConsoleError(text)) {
			consoleErrors.push(text);
			results.addConsoleError(text, page.url());
		} else if (message.type() === 'warn') {
			results.addConsoleWarning(text, page.url());
		}
	});
	page.on('requestfailed', (request) => {
		const failure = request.failure();
		const errorText = failure?.errorText ?? 'request failed';
		results.addNetworkError(request.url(), 'requestfailed', errorText);
	});
	page.on('response', (response) => {
		const status = response.status();
		if (status >= 500) {
			results.addNetworkError(response.url(), status, response.statusText());
		}
	});

	const rootDir = process.cwd();
	const screenshotDirectory = getVersionedScreenshotDir(join(rootDir, 'screenshots'), rootDir);
	const checkOverflow = preset !== undefined;
	const options: CrawlerOptions = {
		baseUrl: args.baseUrl,
		contentMinLength: 10,
		interactionDelay: 200,
		pageSettleDelay: 500,
		screenshotDirectory,
		timeout: 45_000,
	};
	const queue = await initialRoutes(args);
	const visited = new Set<string>();
	const errors: string[] = [];

	while (queue.length > 0) {
		const next = queue.shift();
		if (!next || visited.has(next)) continue;
		if (args.startFrom && !next.startsWith(normalizeRoute(args.startFrom))) continue;
		visited.add(next);
		console.log(`[crawltest] ${next}`);

		const result = await visitRoute(
			page,
			args.baseUrl,
			next,
			screenshotDirectory,
			args.screenshotPages,
			viewportName,
			checkOverflow,
			results,
			options
		);
		errors.push(...result.errors);
		if (result.errors.length === 0) {
			errors.push(...(await assertProjectFeatureFilters(page, next)));
			errors.push(...(await assertProjectFeaturesActionsAffordance(page, next)));
			errors.push(...(await assertDisabledActionAffordance(page, next)));
			errors.push(...(await assertAuditSidebarNavigation(page, next, args.baseUrl)));
			if (shouldTestInteractions(next)) {
				await testInteractiveElements(
					page,
					results,
					options,
					await getInteractiveElements(page),
					new URL(next, args.baseUrl).toString()
				);
			}
		}

		if (!args.page) {
			for (const link of result.links) {
				if (!visited.has(link) && !queue.includes(link)) {
					queue.push(link);
				}
			}
		}
	}

	if (args.check404) {
		errors.push(...(await assert404(page, args.baseUrl)));
	}

	if (args.bug) {
		const projectId = await resolveBugProject(args.baseUrl, args.bugProject);
		await fileBugThroughUi(page, args.baseUrl, projectId);
		console.log(`[crawltest] submitted bug report for ${projectId}`);
	}

	errors.push(...pageErrors.map((error) => `page error: ${error}`));
	errors.push(...consoleErrors.map((error) => `console error: ${error}`));
	for (const error of pageErrors) {
		results.addError('PAGE_ERROR', error);
	}
	await page.close();
	return { errors, visited: [...visited] };
}

export async function runCrawltest(args: CrawlArgs): Promise<number> {
	const resolvedArgs = await resolveCrawlArgs(args);
	const results = new TestResults();
	const browser = await puppeteer.launch({
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
		headless: true,
	});

	const viewports: ViewportArg[] =
		resolvedArgs.viewport === 'all-mobile'
			? (MOBILE_VIEWPORT_NAMES as ViewportArg[])
			: [resolvedArgs.viewport];

	try {
		let exitCode = 0;
		if (resolvedArgs.localNetwork) {
			const errors = await assertLocalNetworkAccess(resolvedArgs);
			for (const error of errors) {
				console.error(error);
				results.addError('LOCAL_NETWORK', error);
			}
			if (errors.length > 0) {
				exitCode = 1;
			} else {
				console.log('[local-network] passed');
			}
		}
		for (const viewportName of viewports) {
			const label = viewports.length > 1 ? `crawltest:${viewportName}` : 'crawltest';
			if (viewports.length > 1) {
				console.log(`\n[${label}] === viewport: ${viewportName} ===`);
			}
			const result = await crawl(browser, resolvedArgs, viewportName, results);
			results.routesDiscovered = Math.max(results.routesDiscovered, result.visited.length);
			if (result.errors.length > 0) {
				for (const error of result.errors) {
					console.error(`[${label}] ${error}`);
				}
				exitCode = 1;
			} else {
				console.log(`[${label}] passed ${result.visited.length} page(s)`);
			}
		}
		const report = results.generateReport();
		const written = await writeCrawlReport(report, process.cwd());
		printReport(report, written);
		if (!report.summary.success) {
			exitCode = 1;
		}
		return exitCode;
	} finally {
		await browser.close();
	}
}
