import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { DiaryEntriesPage, DiaryTimelinePage } from '../api/types.ts';

import { listDiaryEntries, listDiaryTimeline } from '../api/diary.ts';
import { runSkill } from '../api/skills.ts';

const DIARY_SKILL_ID = 'diary-entry';

export function useDiaryEntries(projectPath?: string) {
	return useInfiniteQuery<
		DiaryEntriesPage,
		Error,
		{ pageParams: (string | undefined)[]; pages: DiaryEntriesPage[] },
		[string, string, string],
		string | undefined
	>({
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		initialPageParam: undefined,
		queryFn: ({ pageParam, signal }) =>
			listDiaryEntries(
				{
					...(projectPath ? { projectPath } : {}),
					...(pageParam ? { cursor: pageParam } : {}),
				},
				signal,
			),
		queryKey: ['diary', 'entries', projectPath ?? 'all'],
	});
}

export function useDiaryTimeline(projectPath?: string) {
	return useInfiniteQuery<
		DiaryTimelinePage,
		Error,
		{ pageParams: (string | undefined)[]; pages: DiaryTimelinePage[] },
		[string, string, string],
		string | undefined
	>({
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		initialPageParam: undefined,
		queryFn: ({ pageParam, signal }) =>
			listDiaryTimeline(
				{
					...(projectPath ? { projectPath } : {}),
					...(pageParam ? { cursor: pageParam } : {}),
				},
				signal,
			),
		queryKey: ['diary', 'timeline', projectPath ?? 'all'],
	});
}

// Launches the per-project diary-entry skill (a one-shot pipeline session). The new entry
// surfaces once the session terminalizes: its pipeline_status broadcast invalidates ['diary'] via
// useRealtimeInvalidation, and reconcile-on-read picks up the freshly written file.
export function useWriteDiaryEntry(projectPath: string) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	return useMutation({
		mutationFn: () =>
			runSkill({
				executionIntent: 'apply-changes',
				projectDir: projectPath,
				skillId: DIARY_SKILL_ID,
			}),
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : 'Diary entry generation failed');
		},
		onSuccess: (session) => {
			toast.success('Writing today’s diary entry…', {
				action: {
					label: 'View run',
					onClick: () => {
						void navigate(`/pipeline-sessions/${session.id}`);
					},
				},
			});
			void queryClient.invalidateQueries({ queryKey: ['diary'] });
			void queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
		},
	});
}
