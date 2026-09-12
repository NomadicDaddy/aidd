import { useQuery } from '@tanstack/react-query';

import { listProjectNames } from '../api/projectNames.ts';

/**
 * Lightweight project list (id + name + path) for the report dialog's picker, the command palette,
 * the launch pickers and the sidebar count.
 *
 * Backed by /api/v1/projects/names, which skips the heavy per-project metadata compute and keeps
 * those surfaces from blocking on a full project scan when the filesystem cache is cold. Keyed
 * under the `['projects']` prefix, so every invalidation the project mutations already issue
 * refreshes it.
 */
export function useProjectNames() {
	return useQuery({
		queryFn: ({ signal }) => listProjectNames(signal),
		queryKey: ['projects', 'names'],
		staleTime: 30_000,
	});
}
