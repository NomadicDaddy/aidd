import { describe, expect, test } from 'bun:test';

import {
	nearestRankIndex,
	nearestRankPercentile,
} from '../../backend/src/services/metrics/percentile.ts';
import type {
	CrawlBuildIdentity,
	CrawlReport,
	WebVitalEntry,
} from '../../scripts/crawltest-types.ts';
import {
	compareBuildIdentity,
	indexAssetReferences,
	productionIndexHash,
} from '../../scripts/lib/crawltest/build-identity.ts';
import {
	coverageFailures,
	evaluateCrawlVitals,
	percentilesByMetric,
	percentileSnapshot,
} from '../../scripts/lib/crawltest/vitals-p75.ts';

function vital(
	name: string,
	value: number,
	rating = 'good',
	url = 'http://x/projects',
): WebVitalEntry {
	return {
		name,
		navigationType: 'navigate',
		rating,
		timestamp: '2026-08-30T00:00:00.000Z',
		url,
		value,
	};
}

function reportWith(
	webVitals: WebVitalEntry[],
	buildIdentity: CrawlBuildIdentity | null = null,
): CrawlReport {
	return {
		buildIdentity,
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
			webVitalsCount: webVitals.length,
		},
		visitedUrls: ['http://x/projects'],
		webVitals,
	};
}

const identity: CrawlBuildIdentity = {
	indexHash: 'abc123',
	mode: 'production',
	origin: 'http://127.0.0.1:3210',
	revision: 'deadbeef',
	timestamp: '2026-08-30T00:00:00.000Z',
	version: '3.0.0',
};

describe('nearest-rank p75', () => {
	test('takes the ceil(0.75 * n) sample, one-based', () => {
		expect(nearestRankIndex(1, 0.75)).toBe(0);
		expect(nearestRankIndex(4, 0.75)).toBe(2);
		expect(nearestRankIndex(8, 0.75)).toBe(5);
		expect(nearestRankIndex(100, 0.75)).toBe(74);
	});

	test('is undefined over an empty sample set rather than zero', () => {
		expect(nearestRankIndex(0, 0.75)).toBe(-1);
		expect(nearestRankPercentile([], 0.75)).toBeNull();
	});

	test('sorts before ranking, so input order cannot change the answer', () => {
		expect(nearestRankPercentile([5000, 400, 400, 400, 5000, 400, 400, 5000], 0.75)).toBe(5000);
		expect(nearestRankPercentile([400, 400, 400, 400, 400, 5000, 5000, 5000], 0.75)).toBe(5000);
	});

	test('reports a distribution whose mean passes but whose p75 fails', () => {
		const values = [400, 400, 400, 400, 400, 5000, 5000, 5000];
		const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
		expect(mean).toBeLessThan(2500);
		expect(nearestRankPercentile(values, 0.75)).toBeGreaterThan(2500);
	});
});

describe('crawl report percentiles', () => {
	test('keeps the p75 sample and its own rating, and the maximum as a diagnostic', () => {
		const snapshot = percentileSnapshot([
			vital('LCP', 400),
			vital('LCP', 400),
			vital('LCP', 400),
			vital('LCP', 400),
			vital('LCP', 400),
			vital('LCP', 5000, 'poor'),
			vital('LCP', 5000, 'poor'),
			vital('LCP', 9000, 'poor'),
		]);
		expect(snapshot).toMatchObject({ max: 9000, rating: 'poor', sampleCount: 8, value: 5000 });
	});

	test('no longer grades on the worst sample', () => {
		const snapshot = percentileSnapshot([
			vital('LCP', 100),
			vital('LCP', 120),
			vital('LCP', 140),
			vital('LCP', 9000, 'poor'),
		]);
		expect(snapshot?.value).toBe(140);
		expect(snapshot?.max).toBe(9000);
	});

	test('summarizes each metric across routes', () => {
		const metrics = percentilesByMetric(
			reportWith([
				vital('LCP', 1000, 'good', 'http://x/projects'),
				vital('LCP', 2000, 'good', 'http://x/runs'),
				vital('CLS', 0.02),
			]),
		);
		expect(metrics.map((metric) => metric.name)).toEqual(['CLS', 'LCP']);
		expect(metrics.find((metric) => metric.name === 'LCP')?.value).toBe(2000);
	});
});

describe('crawl report admissibility', () => {
	test('names every metric the crawl never observed', () => {
		const failures = coverageFailures(reportWith([vital('LCP', 1000), vital('FCP', 300)]));
		expect(failures).toHaveLength(3);
		expect(failures.join(' ')).toContain('CLS has no samples');
		expect(failures.join(' ')).toContain('INP has no samples');
		expect(failures.join(' ')).toContain('TTFB has no samples');
	});

	test('a report with no build identity is not evidence about any build', () => {
		expect(compareBuildIdentity(null, 'abc123')[0]).toContain('records none');
	});

	test('rejects a build identity that does not match the artifact on disk', () => {
		const failures = compareBuildIdentity(identity, 'zzz999');
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('not the built one');
	});

	test('rejects a non-production build and a missing dist', () => {
		expect(compareBuildIdentity({ ...identity, mode: 'development' }, 'abc123')[0]).toContain(
			'only a production build',
		);
		expect(compareBuildIdentity(identity, null)[0]).toContain(
			'frontend/dist/index.html is missing',
		);
	});

	test('accepts a production report that matches the artifact', () => {
		expect(compareBuildIdentity(identity, 'abc123')).toEqual([]);
	});

	test('a fully covered, matching report has no failures', () => {
		const report = reportWith(
			['CLS', 'FCP', 'INP', 'LCP', 'TTFB'].map((name) => vital(name, 10)),
			identity,
		);
		expect(evaluateCrawlVitals(report, 'abc123')).toEqual([]);
	});
});

describe('build identity hashing', () => {
	const dist = [
		'<!doctype html><html><head>',
		'<link rel="stylesheet" href="/assets/index-Ab12Cd.css">',
		'<script type="module" src="/assets/index-Ef34Gh.js"></script>',
		'<link rel="preconnect" href="https://fonts.gstatic.com">',
		'</head><body></body></html>',
	].join('');

	test('ignores the marker the server injects while serving index.html', () => {
		const served = dist.replace(
			'</head>',
			'<meta name="aidd-trace-default" content="true" /></head>',
		);
		expect(productionIndexHash(served)).toBe(productionIndexHash(dist));
	});

	test('excludes third-party origins and keeps the build’s own assets sorted', () => {
		expect(indexAssetReferences(dist)).toEqual([
			'/assets/index-Ab12Cd.css',
			'/assets/index-Ef34Gh.js',
		]);
	});

	test('a rebuilt bundle changes the hash', () => {
		expect(productionIndexHash(dist.replace('Ef34Gh', 'Zz99Yy'))).not.toBe(
			productionIndexHash(dist),
		);
	});

	test('a dev server, which references source rather than assets, cannot match a dist hash', () => {
		const devServed =
			'<!doctype html><html><head><script type="module" src="/@vite/client"></script>' +
			'<script type="module" src="/src/main.tsx"></script></head><body></body></html>';
		expect(productionIndexHash(devServed)).not.toBe(productionIndexHash(dist));
	});

	test('an index referencing nothing local has no identity to report', () => {
		expect(productionIndexHash('<!doctype html><html><body>nothing</body></html>')).toBeNull();
	});
});
