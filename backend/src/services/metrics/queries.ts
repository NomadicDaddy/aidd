import { and, desc, eq, gte, like } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { SystemMetricHistoryPoint, WebVitalSummary } from './types.ts';

import { WEB_VITAL_NAMES, WEB_VITAL_THRESHOLDS } from '../../constants/webVitals.ts';
import { systemMetrics } from '../../db/schema.ts';

function windowCutoff(hours: number): number {
	return Date.now() - hours * 60 * 60 * 1000;
}

/**
 * Most recent 'system' snapshot, or null if none recorded yet.
 * @param db
 * @returns The latest metric history point or null.
 */
export async function getLatestMetrics(db: WebDatabase): Promise<null | SystemMetricHistoryPoint> {
	const rows = await db
		.select()
		.from(systemMetrics)
		.where(eq(systemMetrics.metricType, 'system'))
		.orderBy(desc(systemMetrics.timestamp))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	return {
		cpuUsage: row.cpuUsage,
		diskUsage: row.diskUsage,
		eventLoopLatency: row.eventLoopLatency,
		heapTotal: row.heapTotal,
		heapUsed: row.heapUsed,
		memoryUsage: row.memoryUsage,
		rss: row.rss,
		timestamp: row.timestamp,
	};
}

/**
 * 'system' snapshots within the last `hours`, newest first, capped at `limit`.
 * @param db
 * @param hours
 * @param limit
 * @returns The metric history points.
 */
export async function getMetricsHistory(
	db: WebDatabase,
	hours: number,
	limit: number,
): Promise<SystemMetricHistoryPoint[]> {
	const rows = await db
		.select()
		.from(systemMetrics)
		.where(
			and(
				eq(systemMetrics.metricType, 'system'),
				gte(systemMetrics.timestamp, windowCutoff(hours)),
			),
		)
		.orderBy(desc(systemMetrics.timestamp))
		.limit(limit);
	return rows.map((row) => ({
		cpuUsage: row.cpuUsage,
		diskUsage: row.diskUsage,
		eventLoopLatency: row.eventLoopLatency,
		heapTotal: row.heapTotal,
		heapUsed: row.heapUsed,
		memoryUsage: row.memoryUsage,
		rss: row.rss,
		timestamp: row.timestamp,
	}));
}

function parseRating(metadata: null | string): null | string {
	if (!metadata) return null;
	try {
		const parsed = JSON.parse(metadata) as { rating?: unknown };
		return typeof parsed.rating === 'string' ? parsed.rating : null;
	} catch {
		return null;
	}
}

/**
 * Per-metric Core Web Vitals summary over the last `hours`: average, latest value + rating, the
 * "good" threshold, and the sample count. Aggregation runs in JS (vitals volume is low) so the
 * latest row's rating can be read out of its JSON metadata.
 * @param db
 * @param hours
 * @returns The web vital summaries.
 */
export async function getWebVitalsSummary(
	db: WebDatabase,
	hours: number,
): Promise<WebVitalSummary[]> {
	const rows = await db
		.select()
		.from(systemMetrics)
		.where(
			and(
				like(systemMetrics.metricType, 'web-vital-%'),
				gte(systemMetrics.timestamp, windowCutoff(hours)),
			),
		)
		.orderBy(desc(systemMetrics.timestamp));

	return WEB_VITAL_NAMES.map((name) => {
		const type = `web-vital-${name.toLowerCase()}`;
		const matching = rows.filter((row) => row.metricType === type);
		const values = matching
			.map((row) => row.value)
			.filter((value): value is number => typeof value === 'number');
		const sampleCount = values.length;
		const average =
			sampleCount > 0
				? Math.round((values.reduce((sum, value) => sum + value, 0) / sampleCount) * 1000) /
					1000
				: 0;
		// rows are sorted newest-first, so the first match is the latest sample.
		const latestRow = matching[0];
		return {
			average,
			latest: latestRow?.value ?? null,
			latestRating: parseRating(latestRow?.metadata ?? null),
			name,
			sampleCount,
			threshold: WEB_VITAL_THRESHOLDS[name] ?? 0,
		};
	});
}
