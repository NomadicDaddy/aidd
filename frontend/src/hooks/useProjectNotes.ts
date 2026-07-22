import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getProjectNotes, saveProjectNotes } from '../api/projectNotes.ts';
import { retryUnlessClientError } from '../api/retry.ts';

export function useProjectNotes(id: string | undefined) {
	return useQuery({
		enabled: Boolean(id),
		queryFn: ({ signal }) => getProjectNotes(id ?? '', signal),
		queryKey: ['project-notes', id],
		retry: retryUnlessClientError,
	});
}

export function useSaveProjectNotes(id: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (content: string) => saveProjectNotes(id ?? '', content),
		onSuccess: (notes) => {
			queryClient.setQueryData(['project-notes', id], notes);
		},
	});
}
