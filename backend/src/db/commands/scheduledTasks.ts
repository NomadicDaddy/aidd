import { and, eq, inArray } from 'drizzle-orm';

import type {
	ClaimScheduledTaskArgs,
	ClaimScheduledTaskResult,
	FinishScheduledExecutionArgs,
	LocalTransaction,
	WriteScheduledTaskArgs,
} from './types.ts';

import { scheduledTaskExecutions, scheduledTaskProjects, scheduledTasks } from '../schema.ts';

const ACTIVE_EXECUTION_STATUSES = ['queued', 'running'] as const;

export function claimScheduledTask(
	tx: LocalTransaction,
	args: ClaimScheduledTaskArgs,
): ClaimScheduledTaskResult {
	const task = tx.select().from(scheduledTasks).where(eq(scheduledTasks.id, args.taskId)).get();
	if (!task || task.state === 'archived') return { kind: 'missing' };
	if (args.trigger !== 'manual') {
		if (task.state !== 'active' || task.nextRunAt !== args.expectedDueAt)
			return { kind: 'missing' };
	}
	const active = tx
		.select({ id: scheduledTaskExecutions.id })
		.from(scheduledTaskExecutions)
		.where(
			and(
				eq(scheduledTaskExecutions.taskId, args.taskId),
				inArray(scheduledTaskExecutions.status, [...ACTIVE_EXECUTION_STATUSES]),
			),
		)
		.get();
	if (active && args.trigger === 'manual') return { kind: 'active' };
	// The caller resolved projects against the task as it looked a moment ago. If the task was
	// re-scoped in between, abandon the claim rather than dispatch against the wrong shape.
	if (task.projectScope !== args.projectScope) return { kind: 'missing' };
	const storedProjectPaths =
		args.projectScope === 'explicit'
			? tx
					.select({ projectPath: scheduledTaskProjects.projectPath })
					.from(scheduledTaskProjects)
					.where(eq(scheduledTaskProjects.taskId, args.taskId))
					.all()
					.map((row) => row.projectPath)
			: [];
	if (args.projectScope === 'explicit' && storedProjectPaths.length === 0)
		return { kind: 'missing' };
	const projectPaths =
		args.projectScope === 'all' ? (args.projectPaths ?? []) : storedProjectPaths;
	const dueAt = args.expectedDueAt ?? args.now;
	const skipped = active !== undefined;
	tx.insert(scheduledTaskExecutions)
		.values({
			completedAt: skipped ? args.now : null,
			dueAt,
			id: args.executionId,
			projectPathsJson: JSON.stringify(projectPaths),
			projectScope: args.projectScope,
			startedAt: args.now,
			status: skipped ? 'skipped' : 'queued',
			targetJson: task.targetJson,
			taskId: task.id,
			trigger: args.trigger,
		})
		.run();
	if (args.trigger !== 'manual') {
		tx.update(scheduledTasks)
			.set({
				nextRunAt: args.nextRunAt,
				state: task.scheduleKind === 'once' ? 'completed' : 'active',
				updatedAt: args.now,
			})
			.where(eq(scheduledTasks.id, task.id))
			.run();
	}
	const result = {
		dueAt,
		executionId: args.executionId,
		projectPaths,
		projectScope: args.projectScope,
		targetJson: task.targetJson,
	};
	return skipped ? { ...result, kind: 'skipped' } : { ...result, kind: 'claimed' };
}

export function finishScheduledExecution(
	tx: LocalTransaction,
	args: FinishScheduledExecutionArgs,
): void {
	tx.update(scheduledTaskExecutions)
		.set({
			childrenJson: args.childrenJson,
			completedAt: args.completedAt,
			dispatchErrorsJson: args.dispatchErrorsJson,
			status: args.status,
		})
		.where(eq(scheduledTaskExecutions.id, args.executionId))
		.run();
}

export function writeScheduledTask(tx: LocalTransaction, args: WriteScheduledTaskArgs): void {
	tx.insert(scheduledTasks)
		.values({
			createdAt: args.createdAt,
			id: args.id,
			name: args.name,
			nextRunAt: args.nextRunAt,
			projectScope: args.projectScope,
			scheduleExpression: args.scheduleExpression,
			scheduleKind: args.scheduleKind,
			state: args.state,
			systemKey: args.systemKey,
			targetJson: args.targetJson,
			targetType: args.targetType,
			timezone: args.timezone,
			updatedAt: args.updatedAt,
		})
		.onConflictDoUpdate({
			// systemKey is absent on purpose: an update must not be able to promote an ordinary task
			// to a built-in one, or demote a built-in one.
			set: {
				archivedAt: null,
				name: args.name,
				nextRunAt: args.nextRunAt,
				projectScope: args.projectScope,
				scheduleExpression: args.scheduleExpression,
				scheduleKind: args.scheduleKind,
				state: args.state,
				targetJson: args.targetJson,
				targetType: args.targetType,
				timezone: args.timezone,
				updatedAt: args.updatedAt,
			},
			target: scheduledTasks.id,
		})
		.run();
	tx.delete(scheduledTaskProjects).where(eq(scheduledTaskProjects.taskId, args.id)).run();
	if (args.projectPaths.length > 0) {
		tx.insert(scheduledTaskProjects)
			.values(args.projectPaths.map((projectPath) => ({ projectPath, taskId: args.id })))
			.run();
	}
}
