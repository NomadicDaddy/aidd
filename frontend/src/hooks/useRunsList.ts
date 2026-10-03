import { useInfiniteQuery } from '@tanstack/react-query';

import { listRuns, type RunsPage } from '../api/listRuns.ts';

// Backstop poll cadence for lists that show live runs. The steady-state signal is the WebSocket
// run_status broadcast; this only self-heals a row left stale by a missed terminal broadcast, so
// it runs solely while a queued or running row is visible and stops once everything is terminal.
const ACTIVE_RUNS_POLL_MS = 15_000;

/**
 * The run list, paged newest first: the one query the Dashboard, the Runs page and the navbar's
 * active-run badge all read, so a load requests it once.
 *
 * A module of its own because the badge lives in the app shell, and the shell is critical-path
 * code. useRuns.ts also carries launch, kill, stop and output mutations with their toast and
 * optimistic-state helpers; the badge importing it put 6 KB of that onto the critical path and over
 * its ceiling. This file imports only the list request.
 */
export function useRunsList(projectPath?: string, options?: { topLevel?: boolean }) {
	const topLevel = options?.topLevel === true;
	return useInfiniteQuery<
		RunsPage,
		Error,
		{ pageParams: (string | undefined)[]; pages: RunsPage[] },
		[string, string, string],
		string | undefined
	>({
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		initialPageParam: undefined,
		queryFn: ({ pageParam, signal }) =>
			listRuns(
				{
					...(projectPath ? { projectPath } : {}),
					...(pageParam ? { cursor: pageParam } : {}),
					...(topLevel ? { topLevel } : {}),
				},
				signal,
			),
		// Stays under the ['runs'] prefix so run_status WebSocket invalidation covers it.
		queryKey: ['runs', projectPath ?? 'all', topLevel ? 'top' : 'all'],
		refetchInterval: (query) => {
			const hasActiveRun = query.state.data?.pages.some((page) =>
				page.runs.some((run) => run.status === 'queued' || run.status === 'running'),
			);
			return hasActiveRun ? ACTIVE_RUNS_POLL_MS : false;
		},
		refetchIntervalInBackground: false,
	});
}
