import type {
	ScheduledTaskExecution,
	ScheduledTaskProjectScope,
	ScheduledTaskSchedule,
} from 'aidd-shared/contracts/scheduled-tasks';

import { formatZonedDate } from '../../lib/formatters.ts';

const HOURLY_STEP_EXPRESSION = /^(\d{1,2}) \*\/(\d{1,2}) \* \* \*$/;

export function projectScopeLabel(scope: ScheduledTaskProjectScope, count: number): string {
	if (scope === 'none') return 'no project';
	if (scope === 'all') return 'all projects';
	return `${count} project${count === 1 ? '' : 's'}`;
}

// A cadence in one line, for surfaces that show a task without letting anyone edit it. The cron
// expression is printed as written: it is what the operator typed, and translating it into prose
// would say less than the expression does.
export function scheduleSummary(schedule: ScheduledTaskSchedule): string {
	if (schedule.kind === 'cron') return `${schedule.expression} · ${schedule.timezone}`;
	return `Once at ${formatZonedDate(schedule.runAt, schedule.timezone)}`;
}

export function advancedScheduleDescription(expression: string): null | string {
	const match = HOURLY_STEP_EXPRESSION.exec(expression.trim());
	if (!match) return null;
	const minute = Number(match[1]);
	const interval = Number(match[2]);
	if (minute > 59 || interval < 1 || interval > 24) return null;
	const minuteDescription =
		minute === 0
			? 'on the hour'
			: `at ${minute} minute${minute === 1 ? '' : 's'} past the hour`;
	return `Every ${interval} hour${interval === 1 ? '' : 's'}, ${minuteDescription}.`;
}

export function nextRunLabel(nextRunAt: null | number, timezone: string): string {
	return nextRunAt === null ? 'No future occurrence' : formatZonedDate(nextRunAt, timezone);
}

// An empty path list means something different under each scope, so the occurrence's own snapshot
// decides: a no-project task that ran exactly as designed must not read as a discovery failure.
export function occurrenceProjectsLabel(
	execution: Pick<ScheduledTaskExecution, 'projectPaths' | 'projectScope'>,
): string {
	if (execution.projectScope === 'none') return 'No project. Ran once.';
	if (execution.projectPaths.length === 0) return 'No projects were available.';
	return execution.projectPaths.join(', ');
}
