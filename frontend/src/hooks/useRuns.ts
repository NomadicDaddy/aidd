import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
	DirectiveRunLaunchRequest,
	RunLaunchRequest,
	RunOutputWindowRequest,
} from '../api/types.ts';

import {
	continueRun,
	getRun,
	getRunOutput,
	killRun,
	launchDirectiveRun,
	launchRun,
	stopRun,
} from '../api/runs.ts';
import { reportFailure } from '../lib/failureToast.ts';
import { beginLaunch, endLaunch, trackLaunchedRun } from '../lib/launchedRuns.ts';
import { clearStopRequested, markStopRequested } from '../lib/stopRequests.ts';
import { useRunsList } from './useRunsList.ts';

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

export function useLaunchDirectiveRun() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: DirectiveRunLaunchRequest) => launchDirectiveRun(request),
		onMutate: beginLaunch,
		onSettled: endLaunch,
		onSuccess: (run) => {
			trackLaunchedRun(run.id, { mode: 'directive' });
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

export function useRunOutputWindow() {
	return useMutation({
		mutationFn: ({ id, window }: { id: string; window: RunOutputWindowRequest }) =>
			getRunOutput(id, undefined, window),
	});
}

/**
 * The run list. The query itself lives in useRunsList.ts so the app shell can read it without
 * this module's mutations; this stays a function rather than a re-export so source scans that
 * follow one hook into another (the dashboard initial-request test) still reach the query.
 */
export function useRuns(projectPath?: string, options?: { topLevel?: boolean }) {
	return useRunsList(projectPath, options);
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
		kill: useMutation({
			mutationFn: killRun,
			onError: reportFailure('Killing the run'),
			onSuccess,
		}),
		stop: useMutation({
			mutationFn: stopRun,
			// Mark at click time so the row flips to "Stopping…" immediately; the refetch then
			// carries the server-derived RunRecord.stopRequested. Roll back if the request fails
			// (e.g. the run turned terminal first) so the row never shows a stop that never landed.
			onError: (error, id) => {
				clearStopRequested(id);
				reportFailure('Stopping the run')(error);
			},
			onMutate: (id) => markStopRequested(id),
			onSuccess,
		}),
	};
}
