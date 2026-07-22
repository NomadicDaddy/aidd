import { apiGet } from './client.ts';

export interface SystemMetricSnapshot {
	activeConnections: number;
	cpuUsage: number;
	diskUsage: null | number;
	eventLoopLatency: null | number;
	heapTotal: number;
	heapUsed: number;
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

export interface WebVitalSummary {
	average: number;
	latest: null | number;
	latestRating: null | string;
	name: string;
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
	} = {}
): Promise<SystemMetricsResponse> {
	return apiGet<SystemMetricsResponse>(`/api/v1/system/metrics${buildQuery({ ...query })}`);
}

export async function getWebVitalsSummary(hours?: number): Promise<WebVitalSummary[]> {
	const response = await apiGet<{ vitals: WebVitalSummary[] }>(
		`/api/v1/system/web-vitals${buildQuery({ hours })}`
	);
	return response.vitals;
}
