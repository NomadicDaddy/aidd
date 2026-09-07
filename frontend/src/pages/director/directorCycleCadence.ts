import type { ScheduledTaskSchedule } from 'aidd-shared/contracts/scheduled-tasks';

import { advancedScheduleDescription, scheduleSummary } from '../scheduled/scheduledLabels.ts';

export function directorCycleCadence(schedule: ScheduledTaskSchedule): {
	label: string;
	machineValue: boolean;
} {
	if (schedule.kind !== 'cron') {
		return { label: scheduleSummary(schedule), machineValue: false };
	}
	const description = advancedScheduleDescription(schedule.expression);
	return description
		? { label: description, machineValue: false }
		: { label: scheduleSummary(schedule), machineValue: true };
}
