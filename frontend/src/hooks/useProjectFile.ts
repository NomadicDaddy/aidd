import { useQuery } from '@tanstack/react-query';

import { getProjectFileContent } from '../api/projects.ts';

export function useProjectFile(projectId: string, path: null | string) {
	return useQuery({
		enabled: path !== null && projectId.length > 0,
		queryFn: ({ signal }) => getProjectFileContent(projectId, path ?? '', signal),
		queryKey: ['project-file', projectId, path],
	});
}
