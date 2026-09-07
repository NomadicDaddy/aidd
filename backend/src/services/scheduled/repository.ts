import type {
	ScheduledTask,
	ScheduledTaskExecution,
	ScheduledTaskState,
	ScheduledTaskWrite,
} from 'aidd-shared/contracts/scheduled-tasks';

import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { DbCommands } from '../../db/commands.ts';

import { scheduledTaskExecutions, scheduledTaskProjects, scheduledTasks } from '../../db/schema.ts';
import { canonicalProjectPath } from '../../paths.ts';
import { executionRecord, taskRecord } from './records.ts';
import { nextOccurrence, validateSchedule } from './recurrence.ts';

export const MAX_EXECUTION_PAGE_SIZE = 100;

export class ScheduledTaskRepository {
	private readonly db: WebDatabase;
	private readonly commands: DbCommands;

	constructor(db: WebDatabase, commands: DbCommands) {
		this.db = db;
		this.commands = commands;
	}

	async list(states?: ScheduledTaskState[]): Promise<ScheduledTask[]> {
		const rows = await this.db
			.select()
			.from(scheduledTasks)
			.where(states?.length ? inArray(scheduledTasks.state, states) : undefined)
			.orderBy(asc(scheduledTasks.nextRunAt), asc(scheduledTasks.name));
		const projects = await this.db.select().from(scheduledTaskProjects);
		return rows.map((row) =>
			taskRecord(
				row,
				projects.filter((item) => item.taskId === row.id).map((item) => item.projectPath),
			),
		);
	}

	async get(id: string): Promise<ScheduledTask | undefined> {
		const row = (
			await this.db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id)).limit(1)
		)[0];
		if (!row) return undefined;
		const projects = await this.db
			.select({ projectPath: scheduledTaskProjects.projectPath })
			.from(scheduledTaskProjects)
			.where(eq(scheduledTaskProjects.taskId, id));
		return taskRecord(
			row,
			projects.map((item) => item.projectPath),
		);
	}

	// Built-in tasks are found by their marker rather than by id, so the seeder never has to store
	// one, and by marker alone rather than by state, so a paused built-in is still found.
	async findBySystemKey(systemKey: string): Promise<ScheduledTask | undefined> {
		const row = (
			await this.db
				.select({ id: scheduledTasks.id })
				.from(scheduledTasks)
				.where(eq(scheduledTasks.systemKey, systemKey))
				.limit(1)
		)[0];
		return row ? await this.get(row.id) : undefined;
	}

	async write(
		id: string,
		input: ScheduledTaskWrite,
		now: number,
		systemKey: null | string = null,
	): Promise<ScheduledTask> {
		validateSchedule(input.schedule);
		const existing = await this.get(id);
		const computedNextRunAt = nextOccurrence(input.schedule, now);
		const state =
			existing?.state === 'paused'
				? 'paused'
				: computedNextRunAt === null
					? 'completed'
					: 'active';
		const nextRunAt = state === 'paused' ? null : computedNextRunAt;
		await this.commands.writeScheduledTask({
			createdAt: existing?.createdAt ?? now,
			id,
			name: input.name.trim(),
			nextRunAt,
			projectPaths: input.projects,
			projectScope: input.projectScope ?? (input.projects.length === 0 ? 'all' : 'explicit'),
			scheduleExpression:
				input.schedule.kind === 'cron' ? input.schedule.expression : input.schedule.runAt,
			scheduleKind: input.schedule.kind,
			state,
			// An existing row keeps whatever marker it already had; only a seeder passes one in.
			systemKey: existing?.systemKey ?? systemKey,
			targetJson: JSON.stringify(input.target),
			targetType: input.target.type,
			timezone: input.schedule.timezone,
			updatedAt: now,
		});
		return (await this.get(id))!;
	}

	async setState(
		id: string,
		state: ScheduledTaskState,
		nextRunAt: null | number,
		now: number,
	): Promise<void> {
		await this.db
			.update(scheduledTasks)
			.set({
				archivedAt: state === 'archived' ? now : null,
				nextRunAt,
				state,
				updatedAt: now,
			})
			.where(eq(scheduledTasks.id, id));
	}

	async executions(taskId: string, limit = 50, offset = 0): Promise<ScheduledTaskExecution[]> {
		const rows = await this.db
			.select()
			.from(scheduledTaskExecutions)
			.where(eq(scheduledTaskExecutions.taskId, taskId))
			.orderBy(desc(scheduledTaskExecutions.startedAt))
			// +1 headroom so the service's has-more probe still works on a full-size page.
			.limit(Math.min(Math.max(limit, 1), MAX_EXECUTION_PAGE_SIZE + 1))
			.offset(Math.max(offset, 0));
		return rows.map(executionRecord);
	}

	async hasActiveExecution(taskId: string): Promise<boolean> {
		const row = await this.db
			.select({ id: scheduledTaskExecutions.id })
			.from(scheduledTaskExecutions)
			.where(
				and(
					eq(scheduledTaskExecutions.taskId, taskId),
					inArray(scheduledTaskExecutions.status, ['queued', 'running']),
				),
			)
			.limit(1);
		return row.length > 0;
	}

	// Only an explicit selection pins a project. An all-project task resolves whatever exists when
	// each occurrence is claimed, so deleting a project is a supported way for that set to shrink
	// rather than a reference that has to be protected.
	async referencesProject(projectPath: string): Promise<boolean> {
		const target = canonicalProjectPath(projectPath);
		return (await this.list(['active', 'completed', 'paused'])).some((task) =>
			task.projects.some((path) => canonicalProjectPath(path) === target),
		);
	}

	async referencesTarget(type: 'recipe' | 'skill', id: string): Promise<boolean> {
		return (await this.list(['active', 'completed', 'paused'])).some((task) =>
			type === 'recipe'
				? task.target.type === 'recipe' && task.target.recipeId === id
				: task.target.type === 'skill' && task.target.skillId === id,
		);
	}
}
