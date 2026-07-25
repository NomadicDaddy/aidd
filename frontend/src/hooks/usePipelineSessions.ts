import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
	getPipelineSessionReport,
	listPipelineSessions,
	type PipelineSessionsPage,
	stopPipelineSession,
} from '../api/pipelineSessions.ts';
import { retryUnlessClientError } from '../api/retry.ts';

const ACTIVE_SESSION_POLL_MS = 3000;

export function usePipelineSessionReport(id: string | undefined) {
	return useQuery({
		enabled: id !== undefined && id.length > 0,
		queryFn: () => getPipelineSessionReport(id ?? ''),
		queryKey: ['pipeline-session-report', id],
		refetchInterval: (query) => {
			const status = query.state.data?.session.status;
			if (status === 'queued' || status === 'running') return ACTIVE_SESSION_POLL_MS;
			return false;
		},
		refetchIntervalInBackground: false,
		retry: retryUnlessClientError,
	});
}

export function usePipelineSessions() {
	const queryClient = useQueryClient();
	const refresh = () => queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
	return {
		sessions: useInfiniteQuery<
			PipelineSessionsPage,
			Error,
			{ pageParams: (string | undefined)[]; pages: PipelineSessionsPage[] },
			[string],
			string | undefined
		>({
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: undefined,
			queryFn: ({ pageParam }) =>
				listPipelineSessions(pageParam ? { cursor: pageParam } : {}),
			queryKey: ['pipeline-sessions'],
		}),
		stopSession: useMutation({ mutationFn: stopPipelineSession, onSuccess: refresh }),
	};
}

/**
 * Lightweight count of active pipeline sessions (status `running` or `queued`)
 * for the navbar badge. Fetches the first page of sessions (sorted by most
 * recent) and counts active ones. Uses the `['pipeline-sessions']` query-key
 * prefix so it is automatically invalidated by WebSocket `pipeline_status`
 * events and reconnect handlers in useRealtimeInvalidation. Polls while active
 * sessions exist so the badge stays fresh even without WS connectivity.
 */
export function useActivePipelineSessionCount() {
	const query = useQuery({
		queryFn: () => listPipelineSessions({ limit: 100 }),
		queryKey: ['pipeline-sessions', 'active-count'],
		refetchInterval: (q) => {
			const sessions = q.state.data?.sessions ?? [];
			const hasActive = sessions.some((s) => s.status === 'running' || s.status === 'queued');
			return hasActive ? ACTIVE_SESSION_POLL_MS : false;
		},
		refetchIntervalInBackground: false,
	});
	const sessions = query.data?.sessions ?? [];
	const activeCount = sessions.filter(
		(s) => s.status === 'running' || s.status === 'queued',
	).length;
	return activeCount;
}
