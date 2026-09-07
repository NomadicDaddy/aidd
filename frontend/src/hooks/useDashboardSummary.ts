import { useQuery } from '@tanstack/react-query';

import { getDashboardSummary } from '../api/projects.ts';
import { retryUnlessClientError } from '../api/retry.ts';

/**
 * The Dashboard's single project query.
 *
 * Keyed under `['projects', …]` on purpose: every mutation and socket event that already
 * invalidates `['projects']` prefix-matches this entry, so the landing page stays as fresh as the
 * full listing without a second invalidation vocabulary. `useProjects()` remains the query for
 * surfaces that need whole project records.
 */
export function useDashboardProjectSummary() {
	return useQuery({
		queryFn: ({ signal }) => getDashboardSummary(signal),
		queryKey: ['projects', 'dashboard-summary'],
		retry: retryUnlessClientError,
		staleTime: 30_000,
	});
}
