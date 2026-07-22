import type { WebDatabase } from '../db/client.ts';
import type {
	MetricSnapshot,
	StoreWebVitalsInput,
	SystemMetricHistoryPoint,
	WebVitalSummary,
} from './metrics/types.ts';

import { webLogger } from '../logger.ts';
import {
	getCpuUsage,
	getDiskUsagePercent,
	getEventLoopLatency,
	getMemoryUsagePercent,
	measureEventLoopLatency,
	stopEventLoopLatencyTimer,
} from './metrics/metricsHelpers.ts';
import {
	getRequestCount,
	loadPersistedRequestCount,
	persistRequestCount,
	pruneOldMetrics,
	storeSystemSnapshot,
	storeWebVitals,
} from './metrics/persistence.ts';
import { getLatestMetrics, getMetricsHistory, getWebVitalsSummary } from './metrics/queries.ts';

export { incrementRequestCount } from './metrics/persistence.ts';
export type {
	MetricSnapshot,
	StoreWebVitalsInput,
	SystemMetricHistoryPoint,
	WebVitalMetric,
	WebVitalSummary,
} from './metrics/types.ts';

/** How often a resource snapshot is collected and persisted. */
const COLLECTION_INTERVAL_MS = 60_000;

/** Default and ceiling for the metrics-history window, mirroring spernakit's bounds. */
export const DEFAULT_METRICS_HOURS = 6;
export const MAX_METRICS_HOURS = 720;
export const MAX_HISTORY_LIMIT = 100;

/**
 * Retention window for system_metrics rows. Rows older than this are pruned on each
 * collection cycle so the table never grows unbounded (~525k rows/yr at 1/min without
 * pruning). Mirrors the active-runs COMPLETED_RUN_TTL_MS TTL precedent in spirit:
 * bounded retention, periodic sweep, no manual cleanup needed.
 *
 * Aligned with MAX_METRICS_HOURS so history queries never scan past what the table
 * retains.
 */
const METRICS_RETENTION_MS = MAX_METRICS_HOURS * 60 * 60 * 1000;

interface MetricsServiceInput {
	/** Absolute path to the panel data directory (for disk-usage sampling). */
	dataDir: string;
	db: WebDatabase;
	/** Live count of active WebSocket peers. */
	getActiveConnections: () => number;
}

/**
 * Owns runtime metrics collection for the control panel: a periodic resource snapshot (CPU,
 * memory, heap, rss, event-loop latency, disk) persisted to system_metrics, the cumulative
 * request counter, and frontend Core Web Vitals ingestion + summary. Timers are started by
 * initialize() and torn down by stop() during graceful shutdown so they never outlive the server.
 */
export class MetricsService {
	private readonly db: WebDatabase;
	private readonly dataDir: string;
	private readonly getActiveConnections: () => number;
	private collectionTimer: null | ReturnType<typeof setInterval> = null;

	constructor(input: MetricsServiceInput) {
		this.db = input.db;
		this.dataDir = input.dataDir;
		this.getActiveConnections = input.getActiveConnections;
	}

	/** Build a current-moment snapshot without persisting it.
	 * @returns The metric snapshot. */
	collectSnapshot(): MetricSnapshot {
		const mem = process.memoryUsage();
		return {
			activeConnections: this.getActiveConnections(),
			cpuUsage: getCpuUsage(),
			diskUsage: getDiskUsagePercent(this.dataDir),
			eventLoopLatency: getEventLoopLatency(),
			heapTotal: mem.heapTotal,
			heapUsed: mem.heapUsed,
			memoryUsage: getMemoryUsagePercent(),
			requestCount: getRequestCount(),
			rss: mem.rss,
			timestamp: Date.now(),
		};
	}

	/** Load the persisted counter and start the event-loop sampler + collection interval. */
	async initialize(): Promise<void> {
		await loadPersistedRequestCount(this.db);
		measureEventLoopLatency();
		this.collectionTimer = setInterval(() => {
			void this.collectAndStore();
		}, COLLECTION_INTERVAL_MS);
		this.collectionTimer.unref?.();
		webLogger.info({ requestCount: getRequestCount() }, 'metrics service initialized');
	}

	/** Stop timers and flush the request counter. Safe to call more than once. */
	async stop(): Promise<void> {
		if (this.collectionTimer) {
			clearInterval(this.collectionTimer);
			this.collectionTimer = null;
		}
		stopEventLoopLatencyTimer();
		await persistRequestCount(this.db);
	}

	private async collectAndStore(): Promise<void> {
		const snapshot = this.collectSnapshot();
		await storeSystemSnapshot(this.db, snapshot);
		await persistRequestCount(this.db);
		// Prune after the insert so the fresh row is never at risk of being swept.
		await pruneOldMetrics(this.db, METRICS_RETENTION_MS);
	}

	async storeWebVitals(input: StoreWebVitalsInput): Promise<void> {
		await storeWebVitals(this.db, input);
	}

	async getLatestMetrics(): Promise<null | SystemMetricHistoryPoint> {
		return getLatestMetrics(this.db);
	}

	async getMetricsHistory(hours: number, limit: number): Promise<SystemMetricHistoryPoint[]> {
		return getMetricsHistory(this.db, hours, limit);
	}

	async getWebVitalsSummary(hours: number): Promise<WebVitalSummary[]> {
		return getWebVitalsSummary(this.db, hours);
	}
}
