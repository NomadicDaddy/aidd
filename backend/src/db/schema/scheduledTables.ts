import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const scheduledTasks = sqliteTable(
	'scheduled_tasks',
	{
		archivedAt: integer('archived_at'),
		createdAt: integer('created_at').notNull(),
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		nextRunAt: integer('next_run_at'),
		projectScope: text('project_scope').notNull().default('all'),
		scheduleExpression: text('schedule_expression'),
		scheduleKind: text('schedule_kind').notNull(),
		state: text('state').notNull().default('active'),
		// Marks a built-in task. Null for everything an operator creates; unique among the rest, so
		// the Director's cycle task can be found and re-seeded by key rather than by name.
		systemKey: text('system_key'),
		targetJson: text('target_json').notNull(),
		targetType: text('target_type').notNull(),
		timezone: text('timezone').notNull(),
		updatedAt: integer('updated_at').notNull(),
	},
	(table) => [
		index('idx_scheduled_tasks_next_run_at').on(table.nextRunAt),
		index('idx_scheduled_tasks_state').on(table.state),
		uniqueIndex('uq_scheduled_tasks_system_key')
			.on(table.systemKey)
			.where(sql`${table.systemKey} IS NOT NULL`),
		check('ck_scheduled_tasks_schedule_kind', sql`${table.scheduleKind} IN ('cron','once')`),
		check('ck_scheduled_tasks_target_json', sql`json_valid(${table.targetJson})`),
		check(
			'ck_scheduled_tasks_state',
			sql`${table.state} IN ('active','archived','completed','paused')`,
		),
		check(
			'ck_scheduled_tasks_target_type',
			sql`${table.targetType} IN ('audit','director','recipe','skill')`,
		),
		check(
			'ck_scheduled_tasks_project_scope',
			sql`${table.projectScope} IN ('all','explicit','none')`,
		),
		check(
			'ck_scheduled_tasks_director_scope',
			sql`${table.targetType} <> 'director' OR ${table.projectScope} = 'none'`,
		),
		check(
			'ck_scheduled_tasks_system_not_archived',
			sql`${table.systemKey} IS NULL OR ${table.state} <> 'archived'`,
		),
	],
);

export const scheduledTaskProjects = sqliteTable(
	'scheduled_task_projects',
	{
		// Canonical spelling, from the project resolution in services/project/lifecycle.ts.
		projectPath: text('project_path').notNull(),
		taskId: text('task_id').notNull(),
	},
	(table) => [
		uniqueIndex('uq_scheduled_task_projects_task_path').on(table.taskId, table.projectPath),
		index('idx_scheduled_task_projects_project_path').on(table.projectPath),
		foreignKey({
			columns: [table.taskId],
			foreignColumns: [scheduledTasks.id],
			name: 'fk_scheduled_task_projects_task_id',
		}).onDelete('cascade'),
	],
);

export const scheduledTaskExecutions = sqliteTable(
	'scheduled_task_executions',
	{
		childrenJson: text('children_json').notNull().default('[]'),
		completedAt: integer('completed_at'),
		dispatchErrorsJson: text('dispatch_errors_json').notNull().default('[]'),
		dueAt: integer('due_at').notNull(),
		id: text('id').primaryKey(),
		projectPathsJson: text('project_paths_json').notNull(),
		projectScope: text('project_scope').notNull().default('all'),
		startedAt: integer('started_at').notNull(),
		status: text('status').notNull().default('queued'),
		targetJson: text('target_json').notNull(),
		taskId: text('task_id').notNull(),
		trigger: text('trigger').notNull(),
	},
	(table) => [
		index('idx_scheduled_task_executions_task_started').on(table.taskId, table.startedAt),
		index('idx_scheduled_task_executions_status').on(table.status),
		foreignKey({
			columns: [table.taskId],
			foreignColumns: [scheduledTasks.id],
			name: 'fk_scheduled_task_executions_task_id',
		}).onDelete('cascade'),
		check(
			'ck_scheduled_task_executions_status',
			sql`${table.status} IN ('completed','completed_with_failures','failed','queued','running','skipped')`,
		),
		check('ck_scheduled_task_executions_target_json', sql`json_valid(${table.targetJson})`),
		check(
			'ck_scheduled_task_executions_project_paths_json',
			sql`json_valid(${table.projectPathsJson})`,
		),
		check(
			'ck_scheduled_task_executions_dispatch_errors_json',
			sql`json_valid(${table.dispatchErrorsJson})`,
		),
		check('ck_scheduled_task_executions_children_json', sql`json_valid(${table.childrenJson})`),
		check(
			'ck_scheduled_task_executions_trigger',
			sql`${table.trigger} IN ('catch_up','manual','scheduled')`,
		),
		check(
			'ck_scheduled_task_executions_project_scope',
			sql`${table.projectScope} IN ('all','explicit','none')`,
		),
	],
);
