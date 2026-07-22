import { useQuery } from '@tanstack/react-query';

import { getProjectCommitDiff } from '../api/projects.ts';
import { getRunCommits } from '../api/runs.ts';

// Ledger lines are appended once at run finalization and never rewritten, and a commit's
// patch is immutable by definition — both queries cache indefinitely per key.
export function useRunCommits(id: string | undefined) {
	return useQuery({
		enabled: Boolean(id),
		queryFn: ({ signal }) => getRunCommits(id ?? '', signal),
		queryKey: ['run-commits', id],
		staleTime: Infinity,
	});
}

export function useCommitDiff(projectId: string, sha: null | string) {
	return useQuery({
		enabled: sha !== null && projectId.length > 0,
		queryFn: ({ signal }) => getProjectCommitDiff(projectId, sha ?? '', signal),
		queryKey: ['commit-diff', projectId, sha],
		staleTime: Infinity,
	});
}
