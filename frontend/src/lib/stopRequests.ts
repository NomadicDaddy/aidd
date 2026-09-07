// Tracks runs with a locally known pending stop request, so the Runs page can flip a row into its
// "Stopping…" state the instant the user clicks Stop (and when a run_status broadcast carries
// stopRequested) instead of waiting for the next REST refetch to surface the server-derived
// RunRecord.stopRequested flag. The server flag is the durable signal (it survives refresh and
// covers stops requested outside this tab); this set only bridges the gap until it arrives.
//
// Kept free of React: pages/runs subscribes through useStopRequested (useSyncExternalStore).

const requested = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
	for (const listener of listeners) listener();
}

export function markStopRequested(runId: string): void {
	if (requested.has(runId)) return;
	requested.add(runId);
	notify();
}

// Called when a stop request fails (run already terminal) and when a run reaches a terminal
// status — a terminal row never renders as stopping, but clearing keeps the set from growing for
// the lifetime of the tab.
export function clearStopRequested(runId: string): void {
	if (!requested.delete(runId)) return;
	notify();
}

export function isStopRequested(runId: string): boolean {
	return requested.has(runId);
}

export function subscribeStopRequests(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
