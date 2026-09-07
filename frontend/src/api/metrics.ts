import { apiGet } from './client.ts';

export interface SystemMetricSnapshot {
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

export interface SystemMetricsResponse {
	current: SystemMetricSnapshot;
	history: SystemMetricHistoryPoint[];
	latest: null | SystemMetricHistoryPoint;
}

/** `p75` is the nearest-rank 75th percentile, or null when the window holds no samples. */
export interface WebVitalSummary {
	latest: null | number;
	latestRating: null | string;
	name: string;
	p75: null | number;
	sampleCount: number;
	threshold: number;
}

function buildQuery(params: Record<string, number | undefined>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) continue;
		search.set(key, String(value));
	}
	const query = search.toString();
	return query.length > 0 ? `?${query}` : '';
}

export async function getSystemMetrics(
	query: {
		hours?: number;
		limit?: number;
	} = {},
): Promise<SystemMetricsResponse> {
	return apiGet<SystemMetricsResponse>(`/api/v1/system/metrics${buildQuery({ ...query })}`);
}

export async function getWebVitalsSummary(hours?: number): Promise<WebVitalSummary[]> {
	const response = await apiGet<{ vitals: WebVitalSummary[] }>(
		`/api/v1/system/web-vitals${buildQuery({ hours })}`,
	);
	return response.vitals;
}
