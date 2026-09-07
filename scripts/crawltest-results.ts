import type {
	ClickedElementEntry,
	ConsoleErrorEntry,
	ConsoleWarningEntry,
	ContentAssertionEntry,
	CrawlBuildIdentity,
	CrawlReport,
	ErrorEntry,
	NetworkErrorEntry,
	WebVitalEntry,
} from './crawltest-types.ts';

export class TestResults {
	/** The build these measurements describe; null until a page publishes one. */
	buildIdentity: CrawlBuildIdentity | null = null;
	clickedElements: ClickedElementEntry[] = [];
	consoleErrors: ConsoleErrorEntry[] = [];
	consoleWarnings: ConsoleWarningEntry[] = [];
	contentAssertions: ContentAssertionEntry[] = [];
	errors: ErrorEntry[] = [];
	networkErrors: NetworkErrorEntry[] = [];
	startTime = Date.now();
	visitedUrls: Set<string> = new Set();
	webVitals: WebVitalEntry[] = [];

	dialogsTested = 0;
	routesDiscovered = 0;
	screenshotsTaken = 0;
	selectsTested = 0;
	switchesTested = 0;

	addError(type: string, message: string, details: Record<string, unknown> = {}): void {
		this.errors.push({
			details,
			message,
			timestamp: new Date().toISOString(),
			type,
		});
	}

	addPageAssertionErrors(route: string, messages: readonly string[]): void {
		for (const message of messages) {
			this.addError('PAGE_ASSERTION', message, { route });
		}
	}

	addConsoleError(message: string, url: string): void {
		this.consoleErrors.push({ message, timestamp: new Date().toISOString(), url });
	}

	addConsoleWarning(message: string, url: string): void {
		this.consoleWarnings.push({ message, timestamp: new Date().toISOString(), url });
	}

	addNetworkError(url: string, status: number | string, statusText: string): void {
		this.networkErrors.push({ status, statusText, timestamp: new Date().toISOString(), url });
	}

	addClickedElement(
		selector: string,
		url: string,
		success: boolean,
		action = 'click',
		error: null | string = null,
	): void {
		this.clickedElements.push({
			action,
			error,
			selector,
			success,
			timestamp: new Date().toISOString(),
			url,
		});
	}

	addWebVital(entry: WebVitalEntry): void {
		this.webVitals.push(entry);
	}

	addContentAssertion(entry: ContentAssertionEntry): void {
		this.contentAssertions.push(entry);
	}

	generateReport(): CrawlReport {
		const duration = Date.now() - this.startTime;
		const failedClicks = this.clickedElements.filter((element) => !element.success).length;
		const contentFailures = this.contentAssertions.filter(
			(entry) => entry.isErrorPage || entry.is404Page || !entry.hasContent,
		).length;
		const success =
			this.errors.length === 0 &&
			this.consoleErrors.length === 0 &&
			this.networkErrors.length === 0 &&
			failedClicks === 0 &&
			contentFailures === 0;

		return {
			buildIdentity: this.buildIdentity,
			clickedElements: this.clickedElements,
			consoleErrors: this.consoleErrors,
			consoleWarnings: this.consoleWarnings,
			contentAssertions: this.contentAssertions,
			errors: this.errors,
			networkErrors: this.networkErrors,
			summary: {
				consoleErrors: this.consoleErrors.length,
				consoleWarnings: this.consoleWarnings.length,
				contentAssertions: this.contentAssertions.length,
				contentFailures,
				dialogsTested: this.dialogsTested,
				duration: `${(duration / 1000).toFixed(2)}s`,
				elementsClicked: this.clickedElements.length,
				failedClicks,
				networkErrors: this.networkErrors.length,
				routesDiscovered: this.routesDiscovered,
				screenshotsTaken: this.screenshotsTaken,
				selectsTested: this.selectsTested,
				success,
				switchesTested: this.switchesTested,
				totalErrors: this.errors.length,
				urlsVisited: this.visitedUrls.size,
				webVitalsCount: this.webVitals.length,
			},
			visitedUrls: [...this.visitedUrls],
			webVitals: this.webVitals,
		};
	}
}
