import type {
	ScheduledTaskExecutionPage,
	ScheduledTaskUpdate,
} from 'aidd-shared/contracts/scheduled-tasks';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
	createScheduledTask,
	listScheduledExecutions,
	listScheduledTasks,
	previewScheduledTask,
	scheduledTaskAction,
	updateScheduledTask,
} from '../api/scheduledTasks.ts';

export function useScheduledTasks() {
	const queryClient = useQueryClient();
	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: ['scheduled-tasks'] });
		void queryClient.invalidateQueries({ queryKey: ['nav-counts'] });
	};
	return {
		action: useMutation({
			mutationFn: ({
				action,
				id,
			}: {
				action: 'archive' | 'pause' | 'resume' | 'run';
				id: string;
			}) => scheduledTaskAction(id, action),
			onSuccess: refresh,
		}),
		create: useMutation({ mutationFn: createScheduledTask, onSuccess: refresh }),
		preview: useMutation({ mutationFn: previewScheduledTask }),
		tasks: useQuery({
			queryFn: () => listScheduledTasks(),
			queryKey: ['scheduled-tasks'],
			refetchInterval: 30_000,
		}),
		update: useMutation({
			mutationFn: ({ id, input }: { id: string; input: ScheduledTaskUpdate }) =>
				updateScheduledTask(id, input),
			onSuccess: refresh,
		}),
	};
}

export function useScheduledExecutions(id: null | string, limit = 20) {
	return useInfiniteQuery<
		ScheduledTaskExecutionPage,
		Error,
		{ pageParams: number[]; pages: ScheduledTaskExecutionPage[] },
		[string, null | string, string, number],
		number
	>({
		enabled: id !== null,
		getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
		initialPageParam: 0,
		queryFn: ({ pageParam }) => listScheduledExecutions(id ?? '', pageParam, limit),
		queryKey: ['scheduled-tasks', id, 'executions', limit],
		refetchInterval: 15_000,
	});
}
