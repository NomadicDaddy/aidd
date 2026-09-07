import { useSyncExternalStore } from 'react';

import { isStopRequested, subscribeStopRequests } from '../lib/stopRequests.ts';

/** Whether this tab knows of a pending stop request for the run (Stop clicked here, or a
 * run_status broadcast carried stopRequested). Combine with the server-derived
 * RunRecord.stopRequested — this only bridges the gap until the next refetch. */
export function useStopRequested(runId: string): boolean {
	return useSyncExternalStore(
		subscribeStopRequests,
		() => isStopRequested(runId),
		// A pending stop request is a fact about this tab, held in a module-level store a render
		// outside the browser cannot have populated. Without this third argument React refuses to
		// render the component at all outside a browser, which is what the panel tests do.
		() => false,
	);
}
