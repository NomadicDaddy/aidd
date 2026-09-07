import { QueryClient } from '@tanstack/react-query';

import { retryUnlessClientError } from './api/retry.ts';

/**
 * The single QueryClient configuration for the app.
 *
 * The retry policy lives here rather than on individual hooks because the failure mode it guards
 * is one of omission: a new list query that simply says `useQuery({ queryFn, queryKey })` inherits
 * React Query's blind three-retry default, so a 401 from an expired token is retried three times
 * before the interface says anything. Making the 4xx-aware predicate the client default means a
 * hook has to opt *out* to get the wrong behaviour, and opting out is visible in review.
 */
export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				refetchOnWindowFocus: false,
				retry: retryUnlessClientError,
				// Concurrent component mounts share one fetch instead of each refetching
				// the same key on mount. Freshness is preserved by explicit invalidation
				// (socket events in useRealtimeInvalidation + mutation onSuccess handlers)
				// and per-query refetchInterval polling, both of which override staleTime.
				staleTime: 30_000,
			},
		},
	});
}
