import { describe, expect, test } from 'bun:test';

import { analyzeCrawlReport } from '../../scripts/crawltest-analyze.ts';
import { normalizeRoute } from '../../scripts/crawltest-config.ts';
import { type CrawlReport, DEFAULT_ROUTES, SKIP_PATTERNS } from '../../scripts/crawltest-types.ts';

describe('crawltest spernakit-style coverage helpers', () => {
	test('normalizes targeted routes', () => {
		expect(normalizeRoute('projects')).toBe('/projects');
		expect(normalizeRoute('/settings')).toBe('/settings');
	});

	test('seeds aidd primary routes', () => {
		expect(DEFAULT_ROUTES).toContain('/projects');
		expect(DEFAULT_ROUTES).toContain('/audits');
		expect(DEFAULT_ROUTES).toContain('/settings');
	});

	test('skips destructive and runtime actions', () => {
		for (const label of [
			'Launch app',
			'Run recipe',
			'Stop app',
			'App start',
			'Delete project',
			'Refresh recipes',
			'Submit Report',
		]) {
			expect(SKIP_PATTERNS.some((pattern) => pattern.test(label))).toBe(true);
		}
	});

	test('analyzer groups non-good Web Vitals by page', () => {
		const report: CrawlReport = {
			clickedElements: [],
			consoleErrors: [],
			consoleWarnings: [],
			contentAssertions: [],
			errors: [],
			networkErrors: [],
			summary: {
				consoleErrors: 0,
				consoleWarnings: 0,
				contentAssertions: 0,
				contentFailures: 0,
				dialogsTested: 0,
				duration: '1.00s',
				elementsClicked: 0,
				failedClicks: 0,
				networkErrors: 0,
				routesDiscovered: 1,
				screenshotsTaken: 0,
				selectsTested: 0,
				success: true,
				switchesTested: 0,
				totalErrors: 0,
				urlsVisited: 1,
				webVitalsCount: 2,
			},
			visitedUrls: ['http://127.0.0.1:3210/projects'],
			webVitals: [
				{
					name: 'LCP',
					navigationType: 'navigate',
					rating: 'poor',
					timestamp: '2026-05-29T00:00:00.000Z',
					url: 'http://127.0.0.1:3210/projects',
					value: 4200,
				},
				{
					name: 'CLS',
					navigationType: 'navigate',
					rating: 'good',
					timestamp: '2026-05-29T00:00:00.000Z',
					url: 'http://127.0.0.1:3210/projects',
					value: 0.01,
				},
			],
		};

		const analysis = analyzeCrawlReport(report);

		expect(analysis.byPage.size).toBe(1);
		expect(analysis.pagesWithIssues).toHaveLength(1);
		expect(analysis.pagesWithIssues[0]?.page).toBe('/projects');
		expect(analysis.pagesWithIssues[0]?.issues[0]?.name).toBe('LCP');
	});
});
