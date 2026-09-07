import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	real,
	sqliteTable,
	text,
} from 'drizzle-orm/sqlite-core';

import { directorCycles } from './directorCycleTable.ts';
import { pipelineSessions, runs } from './runsTables.ts';

export const directorProfiles = sqliteTable(
	'director_profiles',
	{
		backend: text('backend').notNull().default('native'),
		createdAt: integer('created_at').notNull(),
		id: text('id').primaryKey(),
		instructions: text('instructions').notNull().default(''),
		model: text('model'),
		reasoningEffort: text('reasoning_effort').notNull().default('low'),
		role: text('role').notNull().default('Fleet Director'),
		updatedAt: integer('updated_at').notNull(),
	},
	(table) => [
		check(
			'ck_director_profiles_backend',
			sql`${table.backend} IN ('claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')`,
		),
		check(
			'ck_director_profiles_reasoning_effort',
			sql`${table.reasoningEffort} IN ('none','minimal','low','medium','high','xhigh')`,
		),
	],
);

export const directorChatSessions = sqliteTable(
	'director_chat_sessions',
	{
		createdAt: integer('created_at').notNull(),
		id: text('id').primaryKey(),
		profileId: text('profile_id').notNull(),
		title: text('title').notNull(),
		updatedAt: integer('updated_at').notNull(),
	},
	(table) => [
		index('idx_director_chat_sessions_profile_id').on(table.profileId),
		index('idx_director_chat_sessions_updated_at').on(table.updatedAt),
		foreignKey({
			columns: [table.profileId],
			foreignColumns: [directorProfiles.id],
			name: 'fk_director_chat_sessions_profile_id_director_profiles',
		}).onDelete('cascade'),
	],
);

export const directorChatMessages = sqliteTable(
	'director_chat_messages',
	{
		actions: text('actions'),
		content: text('content').notNull(),
		createdAt: integer('created_at').notNull(),
		cycleId: text('cycle_id'),
		id: text('id').primaryKey(),
		role: text('role').notNull(),
		sessionId: text('session_id').notNull(),
	},
	(table) => [
		index('idx_director_chat_messages_cycle_id').on(table.cycleId),
		index('idx_director_chat_messages_session_id_created_at').on(
			table.sessionId,
			table.createdAt,
		),
		foreignKey({
			columns: [table.sessionId],
			foreignColumns: [directorChatSessions.id],
			name: 'fk_director_chat_messages_session_id_director_chat_sessions',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.cycleId],
			foreignColumns: [directorCycles.id],
			name: 'fk_director_chat_messages_cycle_id_director_cycles',
		}).onDelete('set null'),
		check(
			'ck_director_chat_messages_role',
			sql`${table.role} IN ('assistant','system','user')`,
		),
		check(
			'ck_director_chat_messages_actions_json',
			sql`${table.actions} IS NULL OR json_valid(${table.actions})`,
		),
	],
);

export const suggestions = sqliteTable(
	'suggestions',
	{
		confidence: real('confidence'),
		createdAt: integer('created_at').notNull(),
		cycleId: text('cycle_id').notNull(),
		description: text('description').notNull(),
		dismissedBy: text('dismissed_by'),
		evidence: text('evidence'),
		id: text('id').primaryKey(),
		launchedPipelineSessionId: text('launched_pipeline_session_id'),
		launchedRunId: text('launched_run_id'),
		projectId: text('project_id'),
		/**
		 * The order `sortPrioritizedWork` put this work in, scoped to its own cycle and NOT
		 * globally unique. NULL where no prioritized-work item is the ancestor: an aggregate
		 * rollup, a model-authored suggestion with no priority backing, or nothing recorded.
		 * NULLs sort last; nothing back-fills them.
		 */
		rank: integer('rank'),
		reasoning: text('reasoning').notNull(),
		resolvedAt: integer('resolved_at'),
		riskLevel: text('risk_level').notNull(),
		status: text('status').notNull().default('pending'),
		suggestedArgs: text('suggested_args'),
		suggestedRecipe: text('suggested_recipe'),
		taskType: text('task_type').notNull(),
		title: text('title').notNull(),
	},
	(table) => [
		index('idx_suggestions_cycle_id').on(table.cycleId),
		index('idx_suggestions_launched_pipeline_session_id').on(table.launchedPipelineSessionId),
		index('idx_suggestions_launched_run_id').on(table.launchedRunId),
		index('idx_suggestions_project_id').on(table.projectId),
		index('idx_suggestions_status').on(table.status),
		index('idx_suggestions_status_rank').on(table.status, table.rank),
		foreignKey({
			columns: [table.launchedPipelineSessionId],
			foreignColumns: [pipelineSessions.id],
			name: 'fk_suggestions_launched_pipeline_session_id_pipeline_sessions',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.launchedRunId],
			foreignColumns: [runs.id],
			name: 'fk_suggestions_launched_run_id_runs',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.cycleId],
			foreignColumns: [directorCycles.id],
			name: 'fk_suggestions_cycle_id_director_cycles',
		}).onDelete('cascade'),
		check(
			'ck_suggestions_status',
			sql`${table.status} IN ('dismissed','launched','launching','pending')`,
		),
		check('ck_suggestions_risk_level', sql`${table.riskLevel} IN ('HIGH','LOW','MEDIUM')`),
		check(
			'ck_suggestions_task_type',
			sql`${table.taskType} IN ('artifact_maintenance','audit_backlog','audit_maintenance','audit_remediation','ci_failure','code_quality_trend','dependency_hygiene','drift_detection','feature_completion','pr_followup','project_intake','remediation_backlog','smoke_test_failure','stale_project','unused_code')`,
		),
		check(
			'ck_suggestions_dismissed_by',
			sql`${table.dismissedBy} IS NULL OR ${table.dismissedBy} IN ('user','cycle_retire')`,
		),
		check(
			'ck_suggestions_evidence_json',
			sql`${table.evidence} IS NULL OR json_valid(${table.evidence})`,
		),
		check(
			'ck_suggestions_suggested_args_json',
			sql`${table.suggestedArgs} IS NULL OR json_valid(${table.suggestedArgs})`,
		),
	],
);
