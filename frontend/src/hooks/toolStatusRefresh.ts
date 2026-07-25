/**
 * The Settings panels' Refresh button must force a genuine backend re-probe while every
 * ordinary load reuses the cached one. react-query only hands the hook an argument-less
 * `refetch()`, so that intent has to ride a one-shot flag consumed by the next fetch.
 *
 * The flag lives here rather than inline in the hook so the contract is testable without a
 * React renderer, and so `run` can declare no parameters at all: react-query invokes a
 * `queryFn` with a context object, and a fetcher that accepted it positionally would read
 * that object as a truthy `refresh` and re-probe on every single load.
 */
export interface ToolStatusGate<T> {
	/** Mark the next fetch — and only the next — as an explicit re-probe. */
	requestRefresh: () => void;
	/** Fetch, consuming any pending refresh request. Deliberately takes no arguments. */
	run: () => Promise<T>;
}

export function createToolStatusGate<T>(
	fetcher: (refresh?: boolean) => Promise<T>,
): ToolStatusGate<T> {
	let pending = false;
	return {
		requestRefresh: () => {
			pending = true;
		},
		run: async () => {
			const refresh = pending;
			pending = false;
			return await fetcher(refresh);
		},
	};
}
