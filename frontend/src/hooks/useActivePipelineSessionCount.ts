import { useQuery } from '@tanstack/react-query';

import { getActivePipelineSessionCount } from '../api/activePipelineSessionCount.ts';

const ACTIVE_SESSION_POLL_MS = 3000;

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
