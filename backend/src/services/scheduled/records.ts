import type {
	ScheduledExecutionChild,
	ScheduledTask,
	ScheduledTaskExecution,
	ScheduledTaskSchedule,
	ScheduledTaskTarget,
} from 'aidd-shared/contracts/scheduled-tasks';

import type { scheduledTaskExecutions, scheduledTasks } from '../../db/schema/scheduledTables.ts';

type TaskRow = typeof scheduledTasks.$inferSelect;
type ExecutionRow = typeof scheduledTaskExecutions.$inferSelect;

function parseJson<T>(json: string): T {
	return JSON.parse(json) as T;
}

export function taskRecord(row: TaskRow, projects: string[]): ScheduledTask {
	const schedule: ScheduledTaskSchedule =
		row.scheduleKind === 'once'
			? { kind: 'once', runAt: row.scheduleExpression ?? '', timezone: row.timezone }
			: {
					expression: row.scheduleExpression ?? '',
					kind: 'cron',
					timezone: row.timezone,
				};
	return {
		archivedAt: row.archivedAt,
		createdAt: row.createdAt,
		id: row.id,
		name: row.name,
		nextRunAt: row.nextRunAt,
		projects,
		projectScope: row.projectScope as ScheduledTask['projectScope'],
		schedule,
		state: row.state as ScheduledTask['state'],
		systemKey: row.systemKey,
		target: parseJson<ScheduledTaskTarget>(row.targetJson),
		updatedAt: row.updatedAt,
	};
}

export function executionRecord(row: ExecutionRow): ScheduledTaskExecution {
	return {
		children: parseJson<ScheduledExecutionChild[]>(row.childrenJson),
		completedAt: row.completedAt,
		dispatchErrors: parseJson<string[]>(row.dispatchErrorsJson),
		dueAt: row.dueAt,
		id: row.id,
		projectPaths: parseJson<string[]>(row.projectPathsJson),
		projectScope: row.projectScope as ScheduledTaskExecution['projectScope'],
		startedAt: row.startedAt,
		status: row.status as ScheduledTaskExecution['status'],
		target: parseJson<ScheduledTaskTarget>(row.targetJson),
		taskId: row.taskId,
		trigger: row.trigger as ScheduledTaskExecution['trigger'],
	};
}
