import { useQuery } from '@tanstack/react-query';

import { getProjectCodeFile, getProjectCodeTree } from '../api/projects.ts';
import { retryUnlessClientError } from '../api/retry.ts';

export function useProjectCodeTree(id: string | undefined) {
	return useQuery({
		enabled: Boolean(id),
		queryFn: ({ signal }) => getProjectCodeTree(id ?? '', signal),
		queryKey: ['project-code-tree', id],
		retry: retryUnlessClientError,
		staleTime: 60_000,
	});
}

export function useProjectCodeFile(id: string | undefined, path: null | string) {
	return useQuery({
		enabled: Boolean(id) && path !== null,
		queryFn: ({ signal }) => getProjectCodeFile(id ?? '', path ?? '', signal),
		queryKey: ['project-code-file', id, path],
		retry: retryUnlessClientError,
		staleTime: 60_000,
	});
}
