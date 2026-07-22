import { useQuery } from '@tanstack/react-query';

import { listRuns } from '../api/runs.ts';

// Backstop poll cadence for the navbar active-run badge. The steady-state
// signal is the WebSocket run_status broadcast; this only self-heals a
// stale count from a missed terminal broadcast, so it runs solely while a
// `running` run is visible and stops once everything is terminal.
const ACTIVE_RUNS_POLL_MS = 15_000;

/**
 * Lightweight count of active runs (status `running`) for the navbar badge.
 * Fetches the first page of runs (sorted by most recent) and counts active
 * ones. Uses the `['runs']` query-key prefix so it is automatically
 * invalidated by WebSocket `run_status` events and reconnect handlers in
 * useRealtimeInvalidation. Polls while active runs exist so the badge stays
 * fresh even without WS connectivity.
 */
export function useActiveRunCount() {
	const query = useQuery({
		queryFn: ({ signal }) => listRuns({ limit: 100 }, signal),
		queryKey: ['runs', 'active-count'],
		refetchInterval: (q) => {
			const runs = q.state.data?.runs ?? [];
			const hasActive = runs.some((r) => r.status === 'running');
			return hasActive ? ACTIVE_RUNS_POLL_MS : false;
		},
		refetchIntervalInBackground: false,
	});
	const runs = query.data?.runs ?? [];
	return runs.filter((r) => r.status === 'running').length;
}
