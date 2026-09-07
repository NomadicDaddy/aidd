import type { ScheduledTask } from 'aidd-shared/contracts/scheduled-tasks';

export function canResumeScheduledTask(task: ScheduledTask, now = Date.now()): boolean {
	if (task.state !== 'paused' && task.state !== 'completed') return false;
	if (task.schedule.kind === 'cron') return true;
	return Date.parse(task.schedule.runAt) > now;
}
