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

import { directorCycles } from './directorTables.ts';

// project_path and project_name are intentionally denormalized on runs and
// pipeline_sessions. Projects are discovered from configured filesystem roots,
// not persisted as first-class rows, so there is no projects table to anchor a
// foreign key. See assertion DATA-007 in .aidd/assertions.md before introducing
// a projects table.
//
// pipeline_sessions is declared before runs because runs.pipeline_session_id
// carries a foreign key to pipeline_sessions.id; the referenced table object
// must exist at module-evaluation time.
export const pipelineSessions = sqliteTable(
	'pipeline_sessions',
	{
		completedAt: integer('completed_at'),
		currentStepIndex: integer('current_step_index').notNull().default(0),
		durationMs: integer('duration_ms'),
		errorMessage: text('error_message'),
		id: text('id').primaryKey(),
		// Session-level launch-target override chosen at launch time (nullable = no
		// override). Persisted so resumed sessions keep the user's explicit choice.
		launchBackend: text('launch_backend'),
		launchModel: text('launch_model'),
		launchReasoningEffort: text('launch_reasoning_effort'),
		metadataOnly: integer('metadata_only').notNull().default(0),
		parametersJson: text('parameters_json').notNull(),
		projectName: text('project_name').notNull(),
		projectPath: text('project_path').notNull(),
		recipeId: text('recipe_id').notNull(),
		recipeName: text('recipe_name').notNull(),
		startedAt: integer('started_at').notNull(),
		status: text('status').notNull().default('queued'),
		totalSteps: integer('total_steps').notNull(),
	},
	(table) => [
		index('idx_pipeline_sessions_project_path').on(table.projectPath),
		index('idx_pipeline_sessions_recipe_id').on(table.recipeId),
		index('idx_pipeline_sessions_started_at').on(table.startedAt),
		index('idx_pipeline_sessions_status').on(table.status),
		check(
			'ck_pipeline_sessions_status',
			sql`${table.status} IN ('completed','completed_with_failures','failed','queued','running','stopped')`
		),
		check(
			'ck_pipeline_sessions_launch_backend',
			sql`${table.launchBackend} IS NULL OR ${table.launchBackend} IN ('claude-code','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')`
		),
		check(
			'ck_pipeline_sessions_launch_reasoning_effort',
			sql`${table.launchReasoningEffort} IS NULL OR ${table.launchReasoningEffort} IN ('none','minimal','low','medium','high','xhigh')`
		),
	]
);

// The import of directorCycles above is circular (directorTables.ts imports
// `runs` from this module), but safe: both references appear only inside the lazy
// table-extras callbacks, which drizzle resolves at getTableConfig() time — after
// both modules have finished evaluating — never during module evaluation itself.
export const runs = sqliteTable(
	'runs',
	{
		activityState: text('activity_state'),
		aiddDirty: integer('aidd_dirty', { mode: 'boolean' }),
		aiddRevision: text('aidd_revision'),
		aiddVersion: text('aidd_version'),
		aiSummary: text('ai_summary'),
		backend: text('backend').notNull(),
		// Output metrics, written once at terminal transition from the CLI heartbeat record (and
		// by the one-shot ledger backfill for historical rows). All nullable: NULL means "not
		// captured" (pre-metric runs, commit-less runs for the line columns) — never zero.
		cachedTokens: integer('cached_tokens'),
		// Soft pointer to the run this one continues (Continue affordance / auto-chain). No FK by
		// design: like project_path, it is denormalized identity that must survive its parent.
		chainedFromRunId: text('chained_from_run_id'),
		commandArgsJson: text('command_args_json'),
		completedAt: integer('completed_at'),
		// 'wall_clock_timeout' | 'initializer_handoff' | 'none' (evaluated, not eligible).
		// NULL = not yet evaluated; the ledger-drift sweep backfills those.
		continuationReason: text('continuation_reason'),
		directorCycleId: text('director_cycle_id'),
		durationMs: integer('duration_ms'),
		errorMessage: text('error_message'),
		exitCode: integer('exit_code'),
		filesChanged: integer('files_changed'),
		heartbeatAt: integer('heartbeat_at'),
		id: text('id').primaryKey(),
		inputTokens: integer('input_tokens'),
		linesAdded: integer('lines_added'),
		linesRemoved: integer('lines_removed'),
		logPath: text('log_path'),
		mode: text('mode').notNull().default('coding'),
		model: text('model'),
		outputTokens: integer('output_tokens'),
		pid: integer('pid'),
		pipelineSessionId: text('pipeline_session_id'),
		projectName: text('project_name').notNull(),
		projectPath: text('project_path').notNull(),
		provider: text('provider'),
		reasoningEffort: text('reasoning_effort'),
		reasoningTokens: integer('reasoning_tokens'),
		source: text('source').notNull().default('web'),
		startedAt: integer('started_at').notNull(),
		status: text('status').notNull().default('running'),
		stopReason: text('stop_reason'),
		summary: text('summary'),
		worktreeBranch: text('worktree_branch'),
		worktreePath: text('worktree_path'),
	},
	(table) => [
		index('idx_runs_director_cycle_id').on(table.directorCycleId),
		index('idx_runs_project_path').on(table.projectPath),
		index('idx_runs_pipeline_session_id').on(table.pipelineSessionId),
		index('idx_runs_started_at').on(table.startedAt),
		index('idx_runs_status').on(table.status),
		// One follow-up per run: continueRun/maybeAutoChainRun are check-then-launch, so this
		// is the invariant that makes their race harmless — the second concurrent insert fails.
		uniqueIndex('uq_runs_chained_from_run_id')
			.on(table.chainedFromRunId)
			.where(sql`chained_from_run_id IS NOT NULL`),
		foreignKey({
			columns: [table.pipelineSessionId],
			foreignColumns: [pipelineSessions.id],
			name: 'fk_runs_pipeline_session_id_pipeline_sessions',
		}).onDelete('set null'),
		// 'set null', not cascade — runs must outlive their director cycles.
		foreignKey({
			columns: [table.directorCycleId],
			foreignColumns: [directorCycles.id],
			name: 'fk_runs_director_cycle_id_director_cycles',
		}).onDelete('set null'),
		check(
			'ck_runs_status',
			sql`${table.status} IN ('completed','failed','killed','running','stopped','waiting_approval')`
		),
		check(
			'ck_runs_mode',
			sql`${table.mode} IN ('audit','coding','director','directive','interview','todo','triumvirate','validate')`
		),
		check(
			'ck_runs_backend',
			sql`${table.backend} IN ('claude-code','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')`
		),
		check('ck_runs_source', sql`${table.source} IN ('cli','web','director')`),
		// Mirrors ck_director_profiles_reasoning_effort, but reasoning_effort is
		// nullable here so NULL is allowed explicitly.
		check(
			'ck_runs_reasoning_effort',
			sql`${table.reasoningEffort} IS NULL OR ${table.reasoningEffort} IN ('none','minimal','low','medium','high','xhigh')`
		),
	]
);

export const pipelineStepResults = sqliteTable(
	'pipeline_step_results',
	{
		completedAt: integer('completed_at'),
		depth: integer('depth').notNull().default(0),
		displayOrder: integer('display_order').notNull(),
		durationMs: integer('duration_ms'),
		errorMessage: text('error_message'),
		exitCode: integer('exit_code'),
		id: text('id').primaryKey(),
		outputSummary: text('output_summary'),
		parentStepResultId: text('parent_step_result_id'),
		phase: text('phase').notNull().default('step'),
		runId: text('run_id'),
		sequenceNumber: integer('sequence_number').notNull(),
		sessionId: text('session_id').notNull(),
		startedAt: integer('started_at'),
		status: text('status').notNull().default('queued'),
		stepName: text('step_name').notNull(),
		stepType: text('step_type').notNull(),
	},
	(table) => [
		uniqueIndex('idx_pipeline_step_results_display_order').on(
			table.sessionId,
			table.displayOrder
		),
		index('idx_pipeline_step_results_parent_step_result_id').on(table.parentStepResultId),
		index('idx_pipeline_step_results_run_id').on(table.runId),
		index('idx_pipeline_step_results_session_id').on(table.sessionId),
		foreignKey({
			columns: [table.runId],
			foreignColumns: [runs.id],
			name: 'fk_pipeline_step_results_run_id_runs',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.sessionId],
			foreignColumns: [pipelineSessions.id],
			name: 'fk_pipeline_step_results_session_id_pipeline_sessions',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.parentStepResultId],
			foreignColumns: [table.id],
			name: 'fk_pipeline_step_results_parent_step_result_id_pipeline_step_results',
		}).onDelete('cascade'),
		check(
			'ck_pipeline_step_results_status',
			sql`${table.status} IN ('completed','failed','queued','running','skipped','stopped')`
		),
		check(
			'ck_pipeline_step_results_phase',
			sql`${table.phase} IN ('post-hook','pre-hook','step')`
		),
		check(
			'ck_pipeline_step_results_step_type',
			sql`${table.stepType} IN ('aidd-cli','hook','skill','recipe-ref','shell')`
		),
	]
);

// Append-only event log capturing every skill/recipe invocation,
// including recipe-nested invocations. Direct web launches set source='web'
// (matching ck_runs_source); nested launches from recipe steps set
// source='recipe-step' and link back to the parent invocation row via
// parent_invocation_id. Run-backed invocations reconcile their terminal
// status by run_id; recipe-backed by session_id.
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
			table.resourceId
		),
		index('idx_invocation_events_started_at').on(table.startedAt),
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
			sql`${table.resourceType} IN ('skill','recipe','run')`
		),
		check('ck_invocation_events_source', sql`${table.source} IN ('cli','recipe-step','web')`),
		// Mirrors ck_runs_backend, but backend is nullable here so NULL is allowed explicitly.
		check(
			'ck_invocation_events_backend',
			sql`${table.backend} IS NULL OR ${table.backend} IN ('claude-code','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')`
		),
		check(
			'ck_invocation_events_status',
			sql`${table.status} IN ('completed','failed','killed','running','stopped')`
		),
		check(
			'ck_invocation_events_parent_resource_type',
			sql`${table.parentResourceType} IS NULL OR ${table.parentResourceType} IN ('skill','recipe','run')`
		),
	]
);
