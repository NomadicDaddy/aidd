import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { RunLaunchRequest } from '../api/types.ts';

import {
	continueRun,
	getRun,
	getRunOutput,
	killRun,
	launchRun,
	listRuns,
	type RunsPage,
	stopRun,
} from '../api/runs.ts';
import { beginLaunch, endLaunch, trackLaunchedRun } from '../lib/launchedRuns.ts';
import { clearStopRequested, markStopRequested } from '../lib/stopRequests.ts';

// Backstop poll cadence for the Active runs table. The steady-state signal is the WebSocket
// run_status broadcast; this only self-heals a row left stale by a missed terminal broadcast,
// so it runs solely while a `running` row is visible and stops once everything is terminal.
const ACTIVE_RUNS_POLL_MS = 15_000;

export function useLaunchRun() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: RunLaunchRequest) => launchRun(request),
		// Bracket the launch round-trip so the toast layer can buffer a terminal run_status that
		// races ahead of onSuccess (an instant no-work run finishes before this POST resolves).
		onMutate: beginLaunch,
		onSettled: endLaunch,
		onSuccess: (run, request) => {
			// Remember this UI-initiated run so useLaunchedRunToasts can surface its terminal
			// outcome (including *why* a no-work run did nothing) — and only for runs the user
			// launched, never background director/CLI runs that share the same socket events.
			trackLaunchedRun(run.id, {
				...(request.feature ? { feature: request.feature } : {}),
				...(request.mode ? { mode: request.mode } : {}),
			});
			void queryClient.invalidateQueries({ queryKey: ['runs'] });
			void queryClient.invalidateQueries({ queryKey: ['project'] });
			void queryClient.invalidateQueries({ queryKey: ['projects'] });
		},
	});
}

// One-click follow-up for a continuation-eligible terminal run (wall-clock timeout with work
// remaining, or initializer completion). Mirrors useLaunchRun's bracket/track/invalidate flow —
// the follow-up is a normal coding run and should toast its terminal outcome the same way.
export function useContinueRun() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => continueRun(id),
		onMutate: beginLaunch,
		onSettled: endLaunch,
		onSuccess: (run) => {
			trackLaunchedRun(run.id, { mode: 'coding' });
			void queryClient.invalidateQueries({ queryKey: ['runs'] });
			void queryClient.invalidateQueries({ queryKey: ['project'] });
			void queryClient.invalidateQueries({ queryKey: ['projects'] });
		},
	});
}

// Backfill / resync only. The steady-state source for visible output is the WebSocket
// run_output stream (see useRunLiveOutput); this query supplies the initial tail and an
// authoritative full-log snapshot on reconnect / terminal status, NOT a 2s poll.
export function useRunOutput(id: string | undefined) {
	return useQuery({
		enabled: Boolean(id),
		queryFn: ({ signal }) => getRunOutput(id ?? '', signal),
		queryKey: ['run-output', id],
		// Override the 30s global staleTime: live growth streams over the WebSocket into local state,
		// never back into this cache, so always-stale forces a fresh backfill each time a run is
		// expanded/re-selected (accumulated output, not a stale snapshot frozen until the next frame).
		staleTime: 0,
	});
}

export function useRuns(projectPath?: string, options?: { topLevel?: boolean }) {
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
				signal
			),
		// Stays under the ['runs'] prefix so run_status WebSocket invalidation covers it.
		queryKey: ['runs', projectPath ?? 'all', topLevel ? 'top' : 'all'],
		refetchInterval: (query) => {
			const hasActiveRun = query.state.data?.pages.some((page) =>
				page.runs.some((run) => run.status === 'running')
			);
			return hasActiveRun ? ACTIVE_RUNS_POLL_MS : false;
		},
		refetchIntervalInBackground: false,
	});
}

// Fallback single-record lookup for a selected run that is not in the loaded list —
// e.g. a pipeline-owned run deep-linked via ?run= while the unified feed lists
// topLevel runs only. Enabled flag keeps this dormant whenever the list already has
// the record.
export function useRunRecord(id: string | undefined, enabled: boolean) {
	return useQuery({
		enabled: Boolean(id) && enabled,
		queryFn: ({ signal }) => getRun(id ?? '', signal),
		queryKey: ['runs', 'record', id],
	});
}

export function useRunControls() {
	const queryClient = useQueryClient();
	const onSuccess = () => {
		void queryClient.invalidateQueries({ queryKey: ['runs'] });
		void queryClient.invalidateQueries({ queryKey: ['project'] });
		void queryClient.invalidateQueries({ queryKey: ['projects'] });
	};
	return {
		kill: useMutation({ mutationFn: killRun, onSuccess }),
		stop: useMutation({
			mutationFn: stopRun,
			// Mark at click time so the row flips to "Stopping…" immediately; the refetch then
			// carries the server-derived RunRecord.stopRequested. Roll back if the request fails
			// (e.g. the run turned terminal first) so the row never shows a stop that never landed.
			onError: (_error, id) => clearStopRequested(id),
			onMutate: (id) => markStopRequested(id),
			onSuccess,
		}),
	};
}
