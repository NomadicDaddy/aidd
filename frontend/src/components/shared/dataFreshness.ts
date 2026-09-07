import { formatUpdatedAgo } from '../../lib/formatters.ts';

// The minimal slice of a TanStack Query result the indicator reads. Any `useQuery` /
// `useInfiniteQuery` result satisfies this structurally, so callers pass their query objects
// directly instead of threading a bespoke per-page refresh state machine.
export interface FreshnessQuery {
	dataUpdatedAt: number;
	errorUpdatedAt: number;
	isError: boolean;
	isFetching: boolean;
}

export interface FreshnessSource {
	label: string;
	query: FreshnessQuery;
}

export interface FreshnessPresentation {
	kind: 'error' | 'fetching' | 'pending' | 'ready';
	text: string;
}

function queryHasLatestError(query: FreshnessQuery): boolean {
	return (
		query.isError || (query.errorUpdatedAt > 0 && query.errorUpdatedAt > query.dataUpdatedAt)
	);
}

/** Resolve one query's own state without allowing sibling queries to change its description. */
export function freshnessPresentation(query: FreshnessQuery, now: number): FreshnessPresentation {
	if (query.isFetching) return { kind: 'fetching', text: 'Refreshing…' };
	if (queryHasLatestError(query)) return { kind: 'error', text: 'Refresh failed' };
	if (query.dataUpdatedAt === 0) return { kind: 'pending', text: 'Not yet loaded' };
	return {
		kind: 'ready',
		text: `Updated ${formatUpdatedAgo(query.dataUpdatedAt, now)}`,
	};
}

export function refreshCompletionAnnouncement(label: string, succeeded: boolean): string {
	return succeeded ? `${label} updated.` : `${label} failed to refresh.`;
}
