import { eq, lt } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { MetricSnapshot, StoreWebVitalsInput } from './types.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { settings, systemMetrics } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';

/** Settings key under which the cumulative request counter is persisted across restarts. */
const REQUEST_COUNT_KEY = 'metrics.requestCount';

let totalRequests = 0;

/** Increment the in-memory request counter. Called from the request-id plugin per request. */
export function incrementRequestCount(): void {
	totalRequests++;
}

/**
 * Current cumulative request count since the counter was last loaded.
 * @returns The request count.
 */
export function getRequestCount(): number {
	return totalRequests;
}

/**
 * Load the persisted request counter from settings on startup so the running total survives a
 * restart. The value is stored as a bare JSON number string (the settings table enforces
 * json_valid); a malformed or negative value is ignored and the counter starts at 0.
 * @param db
 */
export async function loadPersistedRequestCount(db: WebDatabase): Promise<void> {
	try {
		const row = await db
			.select({ value: settings.value })
			.from(settings)
			.where(eq(settings.key, REQUEST_COUNT_KEY))
			.limit(1);
		const raw = row[0]?.value;
		if (raw) {
			const parsed = parseInt(raw, 10);
			if (Number.isFinite(parsed) && parsed > 0) totalRequests = parsed;
		}
	} catch (err) {
		webLogger.warn({ err }, 'metrics: failed to load persisted request count');
	}
}

/**
 * Persist the current request counter to settings (upsert).
 * @param db
 */
export async function persistRequestCount(db: WebDatabase): Promise<void> {
	const value = String(totalRequests);
	try {
		await withSqliteRetry(
			() =>
				db
					.insert(settings)
					.values({ key: REQUEST_COUNT_KEY, value })
					.onConflictDoUpdate({
						set: { updatedAt: Date.now(), value },
						target: settings.key,
					}),
			{ label: 'metrics.persistRequestCount' },
		);
	} catch (err) {
		webLogger.warn({ err }, 'metrics: failed to persist request count');
	}
}

/**
 * Insert one 'system' resource snapshot row.
 * @param db
 * @param snapshot
 */
export async function storeSystemSnapshot(
	db: WebDatabase,
	snapshot: MetricSnapshot,
): Promise<void> {
	try {
		await withSqliteRetry(
			() =>
				db.insert(systemMetrics).values({
					cpuUsage: snapshot.cpuUsage,
					diskUsage: snapshot.diskUsage,
					eventLoopLatency: snapshot.eventLoopLatency,
					heapTotal: snapshot.heapTotal,
					heapUsed: snapshot.heapUsed,
					memoryUsage: snapshot.memoryUsage,
					metricType: 'system',
					rss: snapshot.rss,
					timestamp: snapshot.timestamp,
					value: null,
				}),
			{ label: 'metrics.storeSystemSnapshot' },
		);
	} catch (err) {
		webLogger.warn({ err }, 'metrics: failed to store system snapshot');
	}
}

/**
 * Store a batch of frontend Core Web Vitals. Each metric becomes a 'web-vital-<name>' row whose
 * value is the measurement and whose metadata blob carries the rating/url/navigationType. Any
 * metric the browser rated 'poor' is also surfaced as a warn log so a regression is visible in
 * the logs, not only in the metrics table.
 * @param db
 * @param input
 */
export async function storeWebVitals(db: WebDatabase, input: StoreWebVitalsInput): Promise<void> {
	if (input.metrics.length === 0) return;
	const timestamp = Date.now();
	const rows = input.metrics.map((metric) => ({
		metadata: JSON.stringify({
			navigationType: metric.navigationType,
			rating: metric.rating,
			url: input.url,
		}),
		metricType: `web-vital-${metric.name.toLowerCase()}`,
		timestamp,
		value: metric.value,
	}));
	try {
		await withSqliteRetry(() => db.insert(systemMetrics).values(rows), {
			label: 'metrics.storeWebVitals',
		});
	} catch (err) {
		webLogger.warn({ err }, 'metrics: failed to store web vitals');
		return;
	}
	for (const metric of input.metrics) {
		if (metric.rating === 'poor') {
			webLogger.warn(
				{ metric: metric.name, rating: metric.rating, url: input.url, value: metric.value },
				`web vital "${metric.name}" rated poor`,
			);
		}
	}
}

/**
 * Delete system_metrics rows older than the retention cutoff so the table stays bounded.
 * Called on each collection cycle — runs after the snapshot insert so the fresh row is
 * never at risk of being swept. Failures are logged and swallowed so a transient SQLite
 * error never disrupts collection.
 * @param db
 * @param retentionMs - Rows whose timestamp is older than `Date.now() - retentionMs` are deleted.
 */
export async function pruneOldMetrics(db: WebDatabase, retentionMs: number): Promise<void> {
	const cutoff = Date.now() - retentionMs;
	try {
		await withSqliteRetry(
			() => db.delete(systemMetrics).where(lt(systemMetrics.timestamp, cutoff)),
			{ label: 'metrics.pruneOldMetrics' },
		);
	} catch (err) {
		webLogger.warn({ err }, 'metrics: failed to prune old metrics');
	}
}
