import type { Page } from 'puppeteer';

import {
	DEFAULT_DOCS_ROUTE,
	FRONTEND_ROUTE_IDS,
	FRONTEND_ROUTE_PATHS,
	type FrontendRouteId,
} from 'aidd-shared/contracts/frontend-routes';

export interface ViewportPreset {
	deviceScaleFactor: number;
	hasTouch: boolean;
	height: number;
	isMobile: boolean;
	userAgent: string;
	width: number;
}

const MOBILE_USER_AGENT_IOS =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MOBILE_USER_AGENT_ANDROID =
	'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export const MOBILE_VIEWPORT_PRESETS: Record<string, ViewportPreset> = {
	'android-sm': {
		deviceScaleFactor: 2,
		hasTouch: true,
		height: 800,
		isMobile: true,
		userAgent: MOBILE_USER_AGENT_ANDROID,
		width: 360,
	},
	'iphone-12': {
		deviceScaleFactor: 3,
		hasTouch: true,
		height: 844,
		isMobile: true,
		userAgent: MOBILE_USER_AGENT_IOS,
		width: 390,
	},
	'iphone-max': {
		deviceScaleFactor: 3,
		hasTouch: true,
		height: 932,
		isMobile: true,
		userAgent: MOBILE_USER_AGENT_IOS,
		width: 430,
	},
	'iphone-plus': {
		deviceScaleFactor: 3,
		hasTouch: true,
		height: 896,
		isMobile: true,
		userAgent: MOBILE_USER_AGENT_IOS,
		width: 414,
	},
	'iphone-se1': {
		deviceScaleFactor: 2,
		hasTouch: true,
		height: 568,
		isMobile: true,
		userAgent: MOBILE_USER_AGENT_IOS,
		width: 320,
	},
};

export const MOBILE_VIEWPORT_NAMES = Object.keys(MOBILE_VIEWPORT_PRESETS);
export const VIEWPORT_ARG_VALUES = ['desktop', 'all-mobile', ...MOBILE_VIEWPORT_NAMES] as const;
export type ViewportArg = (typeof VIEWPORT_ARG_VALUES)[number];

export const DEFAULT_BASE_URL = 'http://127.0.0.1:3210';

export type CrawlRouteCoverage =
	| { kind: 'not-found'; requiresFlag: '--404' }
	| { kind: 'pipeline-session' }
	| { kind: 'project' }
	| { kind: 'recipe' }
	| { kind: 'static'; route: string };

export const CRAWL_ROUTE_COVERAGE = {
	about: { kind: 'static', route: FRONTEND_ROUTE_PATHS.about },
	audits: { kind: 'static', route: FRONTEND_ROUTE_PATHS.audits },
	dashboard: { kind: 'static', route: FRONTEND_ROUTE_PATHS.dashboard },
	diary: { kind: 'static', route: FRONTEND_ROUTE_PATHS.diary },
	director: { kind: 'static', route: FRONTEND_ROUTE_PATHS.director },
	docs: { kind: 'static', route: FRONTEND_ROUTE_PATHS.docs },
	docsDetail: { kind: 'static', route: DEFAULT_DOCS_ROUTE },
	notFound: { kind: 'not-found', requiresFlag: '--404' },
	pipelineSessionDetail: { kind: 'pipeline-session' },
	pipelineSessions: { kind: 'static', route: FRONTEND_ROUTE_PATHS.pipelineSessions },
	projectDetail: { kind: 'project' },
	projectProfileMatrix: { kind: 'static', route: FRONTEND_ROUTE_PATHS.projectProfileMatrix },
	projects: { kind: 'static', route: FRONTEND_ROUTE_PATHS.projects },
	recipeCreate: { kind: 'static', route: FRONTEND_ROUTE_PATHS.recipeCreate },
	recipeDetail: { kind: 'recipe' },
	recipes: { kind: 'static', route: FRONTEND_ROUTE_PATHS.recipes },
	runs: { kind: 'static', route: FRONTEND_ROUTE_PATHS.runs },
	settings: { kind: 'static', route: FRONTEND_ROUTE_PATHS.settings },
	settingsExecutionIdentityBadges: {
		kind: 'static',
		route: FRONTEND_ROUTE_PATHS.settingsExecutionIdentityBadges,
	},
	skills: { kind: 'static', route: FRONTEND_ROUTE_PATHS.skills },
	telemetry: { kind: 'static', route: FRONTEND_ROUTE_PATHS.telemetry },
} satisfies Record<FrontendRouteId, CrawlRouteCoverage>;

export const DEFAULT_ROUTES = FRONTEND_ROUTE_IDS.flatMap((id) => {
	const coverage = CRAWL_ROUTE_COVERAGE[id];
	return coverage.kind === 'static' ? [coverage.route] : [];
});

export const SKIP_PATTERNS: RegExp[] = [
	/^logout$/i,
	/^sign.?out$/i,
	/^delete/i,
	/^remove/i,
	/^destroy/i,
	/^revoke/i,
	/^deactivate/i,
	/^disable/i,
	/^save/i,
	/^submit/i,
	/^create/i,
	/^update/i,
	/^send/i,
	/^import/i,
	/^export/i,
	/^mark all/i,
	/^confirm/i,
	/^apply/i,
	/^change password/i,
	/^generate/i,
	/^upload/i,
	/^rename/i,
	/^acknowledge/i,
	/^resolve/i,
	/^cleanup/i,
	/^trigger/i,
	/^launch/i,
	/^run/i,
	/^start/i,
	/^stop/i,
	/^kill/i,
	/^move/i,
	/^reset/i,
	/^reload/i,
	/^refresh/i,
	/^approve/i,
	/^reject/i,
	/^submit report/i,
	/app start/i,
	/app stop/i,
	/start app/i,
	/stop app/i,
	/launch app/i,
	/report a bug/i,
];

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
