import { join } from 'node:path';
import process from 'node:process';
import puppeteer, { type Browser } from 'puppeteer';

import { normalizeRoute, resolveCrawlArgs } from '../../crawltest-config.ts';
import { getInteractiveElements, testInteractiveElements } from '../../crawltest-interactions.ts';
import { printReport, writeCrawlReport } from '../../crawltest-reporting.ts';
import { TestResults } from '../../crawltest-results.ts';
import { getVersionedScreenshotDir } from '../../crawltest-screenshots.ts';
import {
	type CrawlArgs,
	type CrawlerOptions,
	DESKTOP_VIEWPORT,
	MOBILE_VIEWPORT_NAMES,
	MOBILE_VIEWPORT_PRESETS,
	type ViewportArg,
} from '../../crawltest-types.ts';
import { beginReleaseCapture, captureReleaseBuild, RELEASE_VIEWPORT } from '../release-capture.ts';
import { captureBuildIdentity } from './build-identity.ts';
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
	isIgnorableRequestFailure,
	parseWebVitalMessage,
	shouldTestInteractions,
} from './page-assertions.ts';
import { fileBugThroughUi, initialRoutes, resolveBugProject } from './projects.ts';
import { completeReleaseCapture } from './release.ts';
import { visitRoute } from './visit.ts';
import { finalizeRouteVitals } from './vitals-finalize.ts';

interface CrawlResult {
	errors: string[];
	visited: string[];
}

async function crawl(
	browser: Browser,
	args: CrawlArgs,
	viewportName: ViewportArg,
	results: TestResults,
	screenshotDirectory: string,
): Promise<CrawlResult> {
	const page = await browser.newPage();
	await page.evaluateOnNewDocument(
		`(() => {
			try {
				window.localStorage.setItem('aidd:crawltest', '1');
			} catch {}
		})()`,
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
	} else {
		await page.setViewport(args.screenshotPages ? RELEASE_VIEWPORT : DESKTOP_VIEWPORT);
	}

	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];
	page.on('pageerror', (error) =>
		pageErrors.push(error instanceof Error ? error.message : String(error)),
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
		if (isIgnorableRequestFailure(errorText)) return;
		results.addNetworkError(request.url(), 'requestfailed', errorText);
	});
	page.on('response', (response) => {
		const status = response.status();
		if (status >= 500) {
			results.addNetworkError(response.url(), status, response.statusText());
		}
	});

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
			options,
		);
		errors.push(...result.errors);
		if (results.buildIdentity === null && result.errors.length === 0) {
			results.buildIdentity = await captureBuildIdentity(page, args.baseUrl);
		}
		if (result.errors.length === 0) {
			const assertionErrors = [
				...(await assertProjectFeatureFilters(page, next)),
				...(await assertProjectFeaturesActionsAffordance(page, next)),
				...(await assertDisabledActionAffordance(page, next)),
				...(await assertAuditSidebarNavigation(page, next, args.baseUrl)),
			];
			errors.push(...assertionErrors);
			results.addPageAssertionErrors(next, assertionErrors);
			if (shouldTestInteractions(next)) {
				await testInteractiveElements(
					page,
					results,
					options,
					await getInteractiveElements(page),
					new URL(next, args.baseUrl).toString(),
				);
			}
		}

		// Last thing before leaving the route: CLS and INP are only reported when the document goes
		// hidden, and a plain navigation races that report against the teardown of the page.
		await finalizeRouteVitals(page);

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

	const viewports: ViewportArg[] =
		resolvedArgs.viewport === 'all-mobile'
			? (MOBILE_VIEWPORT_NAMES as ViewportArg[])
			: [resolvedArgs.viewport];

	const root = process.cwd();
	const versionDirectory = getVersionedScreenshotDir(join(root, 'screenshots'), root);
	const capture = resolvedArgs.screenshotPages
		? beginReleaseCapture(root, versionDirectory, {
				check404: resolvedArgs.check404,
				page: resolvedArgs.page,
				startFrom: resolvedArgs.startFrom,
				viewport:
					resolvedArgs.viewport === 'desktop'
						? RELEASE_VIEWPORT
						: { height: 0, width: 0 },
			})
		: null;
	let buildBefore: Awaited<ReturnType<typeof captureReleaseBuild>> | null = null;
	const browser = await puppeteer.launch({
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
		headless: true,
	});

	try {
		let exitCode = 0;
		if (capture?.release) {
			try {
				buildBefore = await captureReleaseBuild(root, resolvedArgs.baseUrl);
			} catch (err) {
				console.error(`[release capture] ${String(err)}`);
			}
		}
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
			const result = await crawl(
				browser,
				resolvedArgs,
				viewportName,
				results,
				capture?.directory ?? join(root, 'logs', 'crawltest-screenshots'),
			);
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
		if (capture) {
			if (
				!(await completeReleaseCapture(
					capture,
					report,
					resolvedArgs.baseUrl,
					viewports,
					buildBefore,
					exitCode === 0,
				))
			)
				exitCode = 1;
		}
		return exitCode;
	} finally {
		await browser.close();
	}
}
