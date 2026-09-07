import { and, asc, count, desc, eq, gte, isNotNull, type SQL } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { SystemMetricHistoryPoint, WebVitalSummary } from './types.ts';

import { WEB_VITAL_NAMES, WEB_VITAL_THRESHOLDS } from '../../constants/webVitals.ts';
import { systemMetrics } from '../../db/schema.ts';
import { nearestRankIndex, VITALS_PERCENTILE } from './percentile.ts';

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
 * Rows for one vital inside the window, valued (system snapshots leave `value` null).
 * @param name The Core Web Vital name, e.g. 'LCP'.
 * @param hours Width of the trailing window.
 * @returns The filter, or undefined when drizzle folds it away.
 */
function vitalWindow(name: string, hours: number): SQL | undefined {
	return and(
		eq(systemMetrics.metricType, `web-vital-${name.toLowerCase()}`),
		gte(systemMetrics.timestamp, windowCutoff(hours)),
		isNotNull(systemMetrics.value),
	);
}

/**
 * Nearest-rank p75 for one vital, as two bounded statements: an indexed COUNT, then a single row at
 * the percentile's offset. Neither materialises the window, so the cost is flat in sample volume —
 * the previous shape read every row in the window into JS to divide by their number.
 * @param db
 * @param name
 * @param hours
 * @returns The p75 value and the sample count it was taken from.
 */
async function selectVitalP75(
	db: WebDatabase,
	name: string,
	hours: number,
): Promise<{ p75: null | number; sampleCount: number }> {
	const counted = await db
		.select({ value: count() })
		.from(systemMetrics)
		.where(vitalWindow(name, hours));
	const sampleCount = counted[0]?.value ?? 0;
	const index = nearestRankIndex(sampleCount, VITALS_PERCENTILE);
	if (index < 0) return { p75: null, sampleCount: 0 };

	const rows = await db
		.select({ value: systemMetrics.value })
		.from(systemMetrics)
		.where(vitalWindow(name, hours))
		.orderBy(asc(systemMetrics.value))
		.limit(1)
		.offset(index);
	return { p75: rows[0]?.value ?? null, sampleCount };
}

/**
 * Per-metric Core Web Vitals summary over the last `hours`: nearest-rank p75, latest value +
 * rating, the "good" threshold, and the sample count.
 *
 * p75 rather than an average: an average passes whenever enough fast loads outnumber the slow ones,
 * so a route that is over budget for a quarter of its visits reads as compliant. Nearest rank picks
 * a real sample, so the reported number is a load that actually happened.
 * @param db
 * @param hours
 * @returns The web vital summaries.
 */
export async function getWebVitalsSummary(
	db: WebDatabase,
	hours: number,
): Promise<WebVitalSummary[]> {
	return Promise.all(
		WEB_VITAL_NAMES.map(async (name) => {
			const [{ p75, sampleCount }, latestRows] = await Promise.all([
				selectVitalP75(db, name, hours),
				db
					.select({ metadata: systemMetrics.metadata, value: systemMetrics.value })
					.from(systemMetrics)
					.where(vitalWindow(name, hours))
					.orderBy(desc(systemMetrics.timestamp))
					.limit(1),
			]);
			const latestRow = latestRows[0];
			return {
				latest: latestRow?.value ?? null,
				latestRating: parseRating(latestRow?.metadata ?? null),
				name,
				p75,
				sampleCount,
				threshold: WEB_VITAL_THRESHOLDS[name] ?? 0,
			};
		}),
	);
}
