import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { pipelineSessions, runs } from './runsTables.ts';

// Append-only event log capturing direct and recipe-nested skill, recipe, and run invocations.
export const invocationEvents = sqliteTable(
	'invocation_events',
	{
		argsPresent: integer('args_present').notNull().default(0),
		backend: text('backend'),
		completedAt: integer('completed_at'),
		durationMs: integer('duration_ms'),
		errorMessage: text('error_message'),
		exitCode: integer('exit_code'),
		id: text('id').primaryKey(),
		model: text('model'),
		parentInvocationId: text('parent_invocation_id'),
		parentResourceId: text('parent_resource_id'),
		parentResourceType: text('parent_resource_type'),
		projectName: text('project_name').notNull(),
		projectPath: text('project_path').notNull(),
		resourceId: text('resource_id').notNull(),
		resourceName: text('resource_name').notNull(),
		resourceSha256: text('resource_sha256'),
		resourceType: text('resource_type').notNull(),
		runId: text('run_id'),
		sessionId: text('session_id'),
		source: text('source').notNull(),
		startedAt: integer('started_at').notNull(),
		status: text('status').notNull().default('running'),
	},
	(table) => [
		index('idx_invocation_events_resource_type_resource_id').on(
			table.resourceType,
			table.resourceId,
		),
		index('idx_invocation_events_started_at').on(sql`${table.startedAt} DESC`),
		index('idx_invocation_events_status').on(table.status),
		index('idx_invocation_events_run_id').on(table.runId),
		index('idx_invocation_events_session_id').on(table.sessionId),
		index('idx_invocation_events_parent_invocation_id').on(table.parentInvocationId),
		index('idx_invocation_events_project_path').on(table.projectPath),
		foreignKey({
			columns: [table.runId],
			foreignColumns: [runs.id],
			name: 'fk_invocation_events_run_id_runs',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.sessionId],
			foreignColumns: [pipelineSessions.id],
			name: 'fk_invocation_events_session_id_pipeline_sessions',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.parentInvocationId],
			foreignColumns: [table.id],
			name: 'fk_invocation_events_parent_invocation_id_invocation_events',
		}).onDelete('set null'),
		check(
			'ck_invocation_events_resource_type',
			sql`${table.resourceType} IN ('skill','recipe','run')`,
		),
		check(
			'ck_invocation_events_source',
			sql`${table.source} IN ('cli','recipe-step','scheduled','web')`,
		),
		// The source domains intentionally differ; backend values mirror the runs constraint.
		check(
			'ck_invocation_events_backend',
			sql`${table.backend} IS NULL OR ${table.backend} IN ('claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')`,
		),
		check(
			'ck_invocation_events_status',
			sql`${table.status} IN ('completed','failed','killed','running','stopped')`,
		),
		check(
			'ck_invocation_events_parent_resource_type',
			sql`${table.parentResourceType} IS NULL OR ${table.parentResourceType} IN ('skill','recipe','run')`,
		),
	],
);
