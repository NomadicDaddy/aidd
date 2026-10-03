import { useActivePipelineSessionCount } from './useActivePipelineSessionCount.ts';
import { useRunsList } from './useRunsList.ts';

/**
 * Count of active runs (queued or running) for the navbar badge. Pipeline-owned runs are
 * excluded - their session is counted once by useActivePipelineSessionCount, so a running recipe
 * step never double-counts.
 *
 * It reads the first page of the SAME query the Dashboard and the Runs page use, through
 * useRunsList.ts rather than useRuns.ts, which would put the run mutations on the critical path. It used to run
 * its own `listRuns({ limit: 100 })` under ['runs', 'active-count'], so every load requested the
 * run list twice with identical contents, and the second request finished last among the
 * Dashboard's calls. Sharing the key makes it one request; that query already sits under the
 * ['runs'] prefix the WebSocket invalidation covers, and already polls while anything is active.
 *
 * The page is the default 50 rather than 100. Runs come newest first and anything queued or
 * running is new, so a count that needed the 51st row would be counting a run older than fifty
 * finished ones.
 */
export function useActiveRunCount() {
	const runs = useRunsList().data?.pages[0]?.runs ?? [];
	return runs.filter(
		(r) => (r.status === 'queued' || r.status === 'running') && !r.pipelineSessionId,
	).length;
}

/**
 * Combined active-execution count for the unified Runs nav badge: standalone
 * running runs plus active (queued/running) pipeline sessions, each execution
 * counted exactly once.
 */
export function useActiveExecutionCount() {
	return useActiveRunCount() + useActivePipelineSessionCount();
}
