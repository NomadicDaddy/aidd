import { useSyncExternalStore } from 'react';

import { isStopRequested, subscribeStopRequests } from '../lib/stopRequests.ts';

/** Whether this tab knows of a pending stop request for the run (Stop clicked here, or a
 * run_status broadcast carried stopRequested). Combine with the server-derived
 * RunRecord.stopRequested — this only bridges the gap until the next refetch. */
export function useStopRequested(runId: string): boolean {
	return useSyncExternalStore(subscribeStopRequests, () => isStopRequested(runId));
}
