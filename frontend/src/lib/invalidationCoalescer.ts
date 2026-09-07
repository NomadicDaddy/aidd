/**
 * One outstanding refetch per query key, however fast the broadcasts arrive.
 *
 * A run fanning out over a fleet emits a `run_status` frame per project, and each frame invalidated
 * `['runs']` and `['projects']` on its own. React Query cancels the in-flight refetch and starts a
 * new one per invalidation, so a burst became a burst of requests — the backend log caught seven
 * concurrent `GET /api/v1/runs` and nine `GET /api/v1/projects`, every one of them served in full
 * because a cancelled fetch is only cancelled at the browser. The server did nine times the work to
 * produce one screen.
 *
 * So: collect the keys a burst touched, invalidate each once when the burst settles, and hold a key
 * back while its refetch is running. An event that lands mid-flight is not dropped — it re-queues
 * the key, and the flush after the refetch settles covers it.
 */

export interface InvalidationTarget {
	invalidateQueries: (filters: {
		cancelRefetch?: boolean;
		queryKey: unknown[];
	}) => Promise<unknown>;
}

/** Cancels the pending flush it scheduled. */
type Delay = (run: () => void) => () => void;

/**
 * How long a burst may keep growing before it is flushed. Long enough to collapse a fleet-wide
 * fan-out into one refetch, short enough that no operator reads it as lag — the parts of the UI
 * that must react instantly (a stop request flipping a row to "Stopping…") do so from local state,
 * not from the refetch.
 */
const BURST_WINDOW_MS = 250;

const defaultDelay: Delay = (run) => {
	const timer = setTimeout(run, BURST_WINDOW_MS);
	return () => clearTimeout(timer);
};

export function createInvalidationCoalescer(
	client: InvalidationTarget,
	options: { delay?: Delay } = {},
) {
	const delay = options.delay ?? defaultDelay;
	// Serialized key -> the key itself, so repeats within a burst collapse onto one entry.
	const queued = new Map<string, unknown[]>();
	const inFlight = new Set<string>();
	let cancelPending: (() => void) | null = null;

	function schedule(): void {
		if (cancelPending) return;
		cancelPending = delay(() => {
			cancelPending = null;
			flush();
		});
	}

	function flush(): void {
		for (const [id, queryKey] of [...queued]) {
			// Its own settle handler re-schedules the flush, so leave it queued.
			if (inFlight.has(id)) continue;
			queued.delete(id);
			inFlight.add(id);
			void client
				// Never cancel a refetch that is already fetching what this invalidation asks for:
				// cancelling it is what turned one burst into one request per frame.
				.invalidateQueries({ cancelRefetch: false, queryKey })
				.catch(() => undefined)
				.then(() => {
					inFlight.delete(id);
					if (queued.has(id)) schedule();
				});
		}
	}

	return {
		/** Drop the pending flush. In-flight refetches are left to settle on their own. */
		dispose(): void {
			cancelPending?.();
			cancelPending = null;
			queued.clear();
		},
		invalidate(queryKey: unknown[]): void {
			queued.set(JSON.stringify(queryKey), queryKey);
			schedule();
		},
	};
}
