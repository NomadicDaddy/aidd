import type { CrawlReport, WebVitalEntry } from '../../crawltest-types.ts';

import { WEB_VITAL_NAMES } from '../../../backend/src/constants/webVitals.ts';
import {
	nearestRankIndex,
	VITALS_PERCENTILE,
} from '../../../backend/src/services/metrics/percentile.ts';
import { compareBuildIdentity } from './build-identity.ts';

/**
 * One metric's compliance figure for one route (or for the whole crawl).
 *
 * `value` is the nearest-rank p75 and `rating` is that sample's own rating: nearest rank selects a
 * real observation, so both belong to a page load that happened. `max` is kept beside it as a
 * diagnostic — the previous report graded on the maximum, which named the worst load rather than
 * the compliance the metric is defined against.
 */
export interface MetricSnapshot {
	max: number;
	name: string;
	rating: string;
	sampleCount: number;
	value: number;
}

/**
 * Nearest-rank p75 over a metric's samples.
 * @param entries Samples of one metric, in any order.
 * @returns The snapshot, or null when there are no samples.
 */
export function percentileSnapshot(entries: readonly WebVitalEntry[]): MetricSnapshot | null {
	const index = nearestRankIndex(entries.length, VITALS_PERCENTILE);
	if (index < 0) return null;
	const sorted = [...entries].sort((a, b) => a.value - b.value);
	const chosen = sorted[index];
	const worst = sorted[sorted.length - 1];
	if (!chosen || !worst) return null;
	return {
		max: worst.value,
		name: chosen.name,
		rating: chosen.rating,
		sampleCount: sorted.length,
		value: chosen.value,
	};
}

function groupBy<T>(entries: readonly T[], key: (entry: T) => string): Map<string, T[]> {
	const grouped = new Map<string, T[]>();
	for (const entry of entries) {
		const bucket = grouped.get(key(entry));
		if (bucket) bucket.push(entry);
		else grouped.set(key(entry), [entry]);
	}
	return grouped;
}

/**
 * The page path a sample was recorded on.
 * @param url The sample's absolute URL.
 * @returns The path plus query, or the raw string when it does not parse.
 */
export function toPagePath(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.pathname}${parsed.search}`;
	} catch {
		return url;
	}
}

/**
 * p75 per metric per route.
 * @param report The crawl report.
 * @returns Page path to metric name to snapshot.
 */
export function percentilesByPage(report: CrawlReport): Map<string, Map<string, MetricSnapshot>> {
	const byPage = new Map<string, Map<string, MetricSnapshot>>();
	for (const [page, entries] of groupBy(report.webVitals, (entry) => toPagePath(entry.url))) {
		const metrics = new Map<string, MetricSnapshot>();
		for (const [name, samples] of groupBy(entries, (entry) => entry.name)) {
			const snapshot = percentileSnapshot(samples);
			if (snapshot) metrics.set(name, snapshot);
		}
		byPage.set(page, metrics);
	}
	return byPage;
}

/**
 * p75 per metric across every route, in the canonical metric order.
 * @param report The crawl report.
 * @returns One entry per Core Web Vital that has at least one sample.
 */
export function percentilesByMetric(report: CrawlReport): MetricSnapshot[] {
	const byName = groupBy(report.webVitals, (entry) => entry.name);
	return WEB_VITAL_NAMES.map((name) => percentileSnapshot(byName.get(name) ?? [])).filter(
		(snapshot): snapshot is MetricSnapshot => snapshot !== null,
	);
}

/**
 * Metrics with no samples at all.
 *
 * A crawl that never observed INP or CLS says nothing about them, and a report that still reports
 * success is the failure this check exists to prevent.
 * @param report The crawl report.
 * @returns Human-readable failures, one per uncovered metric.
 */
export function coverageFailures(report: CrawlReport): string[] {
	const counts = groupBy(report.webVitals, (entry) => entry.name);
	return WEB_VITAL_NAMES.filter((name) => (counts.get(name)?.length ?? 0) === 0).map(
		(name) => `coverage: ${name} has no samples, so its p75 is unmeasured.`,
	);
}

/**
 * Everything that disqualifies a report from substantiating p75 compliance: missing metric
 * coverage, and a build identity that is absent or does not match the production artifact.
 * @param report The crawl report.
 * @param expectedIndexHash Hash of `frontend/dist/index.html`, or null when it is absent.
 * @returns Human-readable failures; empty when the report is admissible evidence.
 */
export function evaluateCrawlVitals(
	report: CrawlReport,
	expectedIndexHash: null | string,
): string[] {
	return [
		...compareBuildIdentity(report.buildIdentity, expectedIndexHash),
		...coverageFailures(report),
	];
}
