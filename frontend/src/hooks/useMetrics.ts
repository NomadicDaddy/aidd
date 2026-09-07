import { useQuery } from '@tanstack/react-query';

import { getSystemMetrics, getWebVitalsSummary } from '../api/metrics.ts';

/** Live system resource metrics; refetched on an interval for a near-real-time panel. */
export function useSystemMetrics() {
	return useQuery({
		queryFn: () => getSystemMetrics({ hours: 6 }),
		queryKey: ['system-metrics'],
		refetchInterval: 5_000,
	});
}

/** Core Web Vitals summary over the recent window. */
export function useWebVitalsSummary() {
	return useQuery({
		queryFn: () => getWebVitalsSummary(6),
		queryKey: ['web-vitals-summary'],
		refetchInterval: 30_000,
	});
}
