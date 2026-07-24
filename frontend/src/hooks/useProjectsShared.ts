import type { useQueryClient } from '@tanstack/react-query';

/**
 * Project detail is cached under whichever identity its caller happened to hold. The detail
 * page keys on the route param (`/projects/starsync` -> `['project', 'starsync']`), while the
 * dashboard prefetches by the opaque path-derived id (`['project', 'ZDpcYXBw...']`). The same
 * project therefore lives under two keys, and a mutation only ever knows one of them.
 *
 * Invalidating a single `['project', id]` key consequently missed the query the user was
 * actually looking at: approving a feature from `/projects/starsync` invalidated the opaque-id
 * entry and left the visible one untouched, so the row stayed stale until a full reload.
 * Match the whole family instead — react-query matches query keys by prefix, and only mounted
 * queries refetch, so the cost is a staleness flag on cache entries nobody is watching.
 */
export async function cancelProjectQueries(
	queryClient: ReturnType<typeof useQueryClient>
): Promise<void> {
	await Promise.all([
		queryClient.cancelQueries({ queryKey: ['project'] }),
		queryClient.cancelQueries({ queryKey: ['project-reports'] }),
		queryClient.cancelQueries({ queryKey: ['projects'] }),
		queryClient.cancelQueries({ queryKey: ['runs'] }),
		queryClient.cancelQueries({ queryKey: ['director', 'fleet'] }),
	]);
}

export function invalidateProjectQueries(queryClient: ReturnType<typeof useQueryClient>): void {
	void queryClient.invalidateQueries({ queryKey: ['project'] });
	void queryClient.invalidateQueries({ queryKey: ['project-reports'] });
	void queryClient.invalidateQueries({ queryKey: ['projects'] });
	void queryClient.invalidateQueries({ queryKey: ['director', 'fleet'] });
}
