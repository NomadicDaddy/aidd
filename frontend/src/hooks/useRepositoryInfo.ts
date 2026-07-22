import { useQuery } from '@tanstack/react-query';

import { getProjectRepositoryInfo, getProjectRepositoryRefs } from '../api/projects.ts';
import { retryUnlessClientError } from '../api/retry.ts';

// Repository introspection is computed on demand (git shell-outs + a bounded working-tree scan),
// so it is cached separately from the project detail payload and kept fresh for a minute — the
// numbers drift slowly and a heavy recompute on every tab visit is not worth it.
export function useProjectRepositoryInfo(id: string | undefined) {
	return useQuery({
		enabled: Boolean(id),
		queryFn: ({ signal }) => getProjectRepositoryInfo(id ?? '', signal),
		queryKey: ['project-repository-info', id],
		retry: retryUnlessClientError,
		staleTime: 60_000,
	});
}

// Branches, stashes, and worktrees are git refs metadata — cached separately from the stats payload
// for the same reason. They change infrequently so a 60-second stale window is sufficient.
export function useProjectRepositoryRefs(id: string | undefined) {
	return useQuery({
		enabled: Boolean(id),
		queryFn: ({ signal }) => getProjectRepositoryRefs(id ?? '', signal),
		queryKey: ['project-repository-refs', id],
		retry: retryUnlessClientError,
		staleTime: 60_000,
	});
}
