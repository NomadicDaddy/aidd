import type { Page } from 'puppeteer';

import type { ViewportArg } from './crawltest-data.ts';

export {
	CRAWL_ROUTE_COVERAGE,
	type CrawlRouteCoverage,
	DEFAULT_BASE_URL,
	DEFAULT_ROUTES,
	DESKTOP_VIEWPORT,
	MOBILE_VIEWPORT_NAMES,
	MOBILE_VIEWPORT_PRESETS,
	SKIP_PATTERNS,
	VIEWPORT_ARG_VALUES,
	type ViewportArg,
} from './crawltest-data.ts';

export interface ViewportPreset {
	deviceScaleFactor: number;
	hasTouch: boolean;
	height: number;
	isMobile: boolean;
	userAgent: string;
	width: number;
}

export interface CrawlArgs {
	baseUrl: string;
	baseUrlProvided: boolean;
	bug: boolean;
	bugProject: null | string;
	check404: boolean;
	localNetwork: boolean;
	localNetworkHost: null | string;
	page: null | string;
	screenshotPages: boolean;
	startFrom: null | string;
	viewport: ViewportArg;
}

export interface ErrorEntry {
	details: Record<string, unknown>;
	message: string;
	timestamp: string;
	type: string;
}

export interface ConsoleErrorEntry {
	message: string;
	timestamp: string;
	url: string;
}

export interface ConsoleWarningEntry {
	message: string;
	timestamp: string;
	url: string;
}

export interface NetworkErrorEntry {
	status: number | string;
	statusText: string;
	timestamp: string;
	url: string;
}

export interface ClickedElementEntry {
	action: string;
	error: null | string;
	selector: string;
	success: boolean;
	timestamp: string;
	url: string;
}

/**
 * The build a crawl report describes. Without it a report is a set of numbers with no artifact
 * attached, and no way to tell a measurement of the current build from a stale one.
 */
export interface CrawlBuildIdentity {
	/** SHA-256 over the asset references in the index document the origin served. */
	indexHash: null | string;
	/** Vite mode of the served bundle; anything but `production` cannot substantiate p75. */
	mode: string;
	/** Origin the crawl ran against. */
	origin: string;
	/** Short Git revision the bundle was built from. */
	revision: string;
	/** ISO build timestamp. */
	timestamp: string;
	/** Package version. */
	version: string;
}

export interface WebVitalEntry {
	name: string;
	navigationType: string;
	rating: string;
	timestamp: string;
	url: string;
	value: number;
}

export interface ContentAssertionEntry {
	hasContent: boolean;
	hasHeading: boolean;
	is404Page: boolean;
	isErrorPage: boolean;
	textLength: number;
	timestamp: string;
	url: string;
}

export type InteractionType = 'button' | 'dialog-trigger' | 'select' | 'switch';

export interface InteractiveElement {
	ariaLabel?: string | undefined;
	elementId?: string | undefined;
	index: number;
	text: string;
	type: InteractionType;
}

export interface ReportSummary {
	consoleErrors: number;
	consoleWarnings: number;
	contentAssertions: number;
	contentFailures: number;
	dialogsTested: number;
	duration: string;
	elementsClicked: number;
	failedClicks: number;
	networkErrors: number;
	routesDiscovered: number;
	screenshotsTaken: number;
	selectsTested: number;
	success: boolean;
	switchesTested: number;
	totalErrors: number;
	urlsVisited: number;
	webVitalsCount: number;
}

export interface CrawlReport {
	buildIdentity: CrawlBuildIdentity | null;
	clickedElements: ClickedElementEntry[];
	consoleErrors: ConsoleErrorEntry[];
	consoleWarnings: ConsoleWarningEntry[];
	contentAssertions: ContentAssertionEntry[];
	errors: ErrorEntry[];
	networkErrors: NetworkErrorEntry[];
	summary: ReportSummary;
	visitedUrls: string[];
	webVitals: WebVitalEntry[];
}

export interface CrawlerOptions {
	baseUrl: string;
	contentMinLength: number;
	interactionDelay: number;
	pageSettleDelay: number;
	screenshotDirectory: string;
	timeout: number;
}

export async function waitForContent(page: Page, settleDelay: number): Promise<void> {
	await Bun.sleep(settleDelay);
	try {
		await page.waitForFunction(
			`(() => {
				const main = document.querySelector('main');
				const text = ((main || document.body)?.innerText || '').trim();
				if (text.length > 100) return true;
				const hasBusy =
					document.querySelector('[class*="skeleton"], [class*="Skeleton"], .animate-pulse') !== null;
				return text.length > 10 && !hasBusy;
			})()`,
			{ timeout: 5000 },
		);
	} catch {
		// Sparse pages are allowed; content assertions decide whether this is a failure.
	}
}
