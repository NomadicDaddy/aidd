import type { ScheduledTask, ScheduledTaskState } from 'aidd-shared/contracts/scheduled-tasks';

export function countScheduledTasks(
	tasks: readonly Pick<ScheduledTask, 'state'>[],
): Record<ScheduledTaskState, number> {
	const counts: Record<ScheduledTaskState, number> = {
		active: 0,
		archived: 0,
		completed: 0,
		paused: 0,
	};
	for (const task of tasks) counts[task.state] += 1;
	return counts;
}
