import type { NavCounts } from 'aidd-shared/contracts/nav-counts';

import { useQuery } from '@tanstack/react-query';

import { getNavCounts } from '../api/navCounts.ts';

/**
 * Counts for the Scheduled, Recipes, Skills and Audits sidebar rows.
 *
 * Undefined until the request answers, which renders no badge rather than a zero — the same
 * loading behaviour as the Projects count. The recipe, skill and scheduled-task mutations
 * invalidate `['nav-counts']` alongside their own key, so a created or deleted item moves the
 * badge without waiting for the next mount.
 */
export function useNavCounts(): NavCounts | undefined {
	return useQuery({
		queryFn: ({ signal }) => getNavCounts(signal),
		queryKey: ['nav-counts'],
		staleTime: 30_000,
	}).data;
}
