/** A point-in-time snapshot of process/system resource usage. */
export interface MetricSnapshot {
	activeConnections: number;
	cpuUsage: number;
	diskUsage: null | number;
	eventLoopLatency: null | number;
	heapTotal: null | number;
	heapUsed: null | number;
	memoryUsage: number;
	requestCount: number;
	rss: number;
	timestamp: number;
}

/** One historical system snapshot row, as returned to the metrics API. */
export interface SystemMetricHistoryPoint {
	cpuUsage: null | number;
	diskUsage: null | number;
	eventLoopLatency: null | number;
	heapTotal: null | number;
	heapUsed: null | number;
	memoryUsage: null | number;
	rss: null | number;
	timestamp: number;
}

/** A single Core Web Vital measurement reported by the frontend. */
export interface WebVitalMetric {
	name: string;
	navigationType: string;
	rating: string;
	value: number;
}

export interface StoreWebVitalsInput {
	metrics: WebVitalMetric[];
	url: string;
}

/**
 * Aggregated summary for one Core Web Vital over a time window.
 *
 * `p75` is the nearest-rank 75th percentile — the contract Core Web Vitals are graded against — and
 * is null when the window holds no samples, which is not the same as a measured zero.
 */
export interface WebVitalSummary {
	latest: null | number;
	latestRating: null | string;
	name: string;
	p75: null | number;
	sampleCount: number;
	threshold: number;
}
