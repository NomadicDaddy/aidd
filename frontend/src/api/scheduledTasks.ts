import type {
	ScheduledSchedulePreview,
	ScheduledTask,
	ScheduledTaskExecutionPage,
	ScheduledTaskSchedule,
	ScheduledTaskState,
	ScheduledTaskUpdate,
	ScheduledTaskWrite,
} from 'aidd-shared/contracts/scheduled-tasks';

import { apiGet, apiSend } from './client.ts';

const base = '/api/v1/scheduled-tasks';

export async function listScheduledTasks(states?: ScheduledTaskState[]) {
	const query = states?.length ? `?states=${states.join(',')}` : '';
	return (await apiGet<{ tasks: ScheduledTask[] }>(`${base}${query}`)).tasks;
}

export async function createScheduledTask(input: ScheduledTaskWrite) {
	return (await apiSend<{ task: ScheduledTask }>(base, 'POST', input)).task;
}

// An edit may omit the target: a built-in task does not expose one, and the backend then keeps
// whatever the task already runs.
export async function updateScheduledTask(id: string, input: ScheduledTaskUpdate) {
	return (await apiSend<{ task: ScheduledTask }>(`${base}/${id}`, 'PUT', input)).task;
}

export async function previewScheduledTask(schedule: ScheduledTaskSchedule) {
	return await apiSend<ScheduledSchedulePreview>(`${base}/preview`, 'POST', schedule);
}

export async function listScheduledExecutions(id: string, offset = 0, limit = 20) {
	return await apiGet<ScheduledTaskExecutionPage>(
		`${base}/${id}/executions?limit=${limit}&offset=${offset}`,
	);
}

export async function scheduledTaskAction(
	id: string,
	action: 'archive' | 'pause' | 'resume' | 'run',
) {
	if (action === 'archive') return await apiSend(`${base}/${id}`, 'DELETE');
	return await apiSend(`${base}/${id}/${action}`, 'POST', {});
}
