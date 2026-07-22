import { ApiError } from './client.ts';

const MAX_QUERY_RETRIES = 3;

/**
 * React Query `retry` predicate that gives up immediately on any 4xx client error and
 * otherwise retries transient failures (network blips, 5xx) up to MAX_QUERY_RETRIES.
 *
 * A 4xx is a deterministic client-side error — a 401 (bad/expired token), 403, 404, or
 * 400 — none of which a blind retry can fix; retrying a 401 three times just delays the
 * access-token prompt and triples the failed-request noise. Centralizing the rule here
 * keeps every query consistent with the original 4xx-aware predicate (AppLaunchControl)
 * instead of each hook re-deriving a narrower `status === 404` check that lets 401s retry.
 */
export function retryUnlessClientError(failureCount: number, error: Error): boolean {
	if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
		return false;
	}
	return failureCount < MAX_QUERY_RETRIES;
}
