import { useQuery } from '@tanstack/react-query';

import { getActivePipelineSessionCount } from '../api/activePipelineSessionCount.ts';

// Backstop only, at the run badge's cadence. pipeline_progress and pipeline_status broadcasts
// invalidate ['pipeline-sessions'], which covers this key, so the count already moves within one
// WebSocket event; the poll self-heals a missed terminal broadcast. It was 3 s, which kept the
// shell requesting this endpoint every three seconds for the whole of every recipe run.
const ACTIVE_SESSION_POLL_MS = 15_000;

/** Keep the shell count independent of the report, infinite-list and mutation hooks. */
export function useActivePipelineSessionCount() {
	const query = useQuery({
		queryFn: getActivePipelineSessionCount,
		queryKey: ['pipeline-sessions', 'active-count'],
		refetchInterval: (q) => {
			return (q.state.data ?? 0) > 0 ? ACTIVE_SESSION_POLL_MS : false;
		},
		refetchIntervalInBackground: false,
	});
	return query.data ?? 0;
}
