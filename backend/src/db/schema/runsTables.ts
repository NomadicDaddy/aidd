import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { directorCycles } from './directorCycleTable.ts';
import { scheduledTaskExecutions } from './scheduledTables.ts';

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
		initiator: text('initiator'),
		// Session-level launch-target override chosen at launch time (nullable = no
		// override). Persisted so resumed sessions keep the user's explicit choice.
		launchBackend: text('launch_backend'),
		launchModel: text('launch_model'),
		launchReasoningEffort: text('launch_reasoning_effort'),
		metadataOnly: integer('metadata_only').notNull().default(0),
		parametersJson: text('parameters_json').notNull(),
		projectName: text('project_name').notNull(),
		// Canonical spelling (backend/src/paths.ts canonicalProjectPath), the same as on runs.
		projectPath: text('project_path').notNull(),
		recipeId: text('recipe_id').notNull(),
		recipeName: text('recipe_name').notNull(),
		recipeSha256: text('recipe_sha256'),
		scheduledTaskExecutionId: text('scheduled_task_execution_id'),
		startedAt: integer('started_at').notNull(),
		status: text('status').notNull().default('queued'),
		totalSteps: integer('total_steps').notNull(),
	},
	(table) => [
		index('idx_pipeline_sessions_project_path').on(table.projectPath),
		index('idx_pipeline_sessions_recipe_id').on(table.recipeId),
		index('idx_pipeline_sessions_scheduled_execution_id').on(table.scheduledTaskExecutionId),
		index('idx_pipeline_sessions_started_at').on(sql`${table.startedAt} DESC`),
		index('idx_pipeline_sessions_status').on(table.status),
		foreignKey({
			columns: [table.scheduledTaskExecutionId],
			foreignColumns: [scheduledTaskExecutions.id],
			name: 'fk_pipeline_sessions_scheduled_task_execution_id',
		}).onDelete('set null'),
		check(
			'ck_pipeline_sessions_initiator',
			sql`${table.initiator} IS NULL OR ${table.initiator} IN ('automatic','operator')`,
		),
		check('ck_pipeline_sessions_parameters_json', sql`json_valid(${table.parametersJson})`),
		check(
			'ck_pipeline_sessions_status',
			sql`${table.status} IN ('completed','completed_with_failures','failed','queued','running','stopped')`,
		),
		check(
			'ck_pipeline_sessions_launch_backend',
			sql`${table.launchBackend} IS NULL OR ${table.launchBackend} IN ('claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')`,
		),
		check(
			'ck_pipeline_sessions_launch_reasoning_effort',
			sql`${table.launchReasoningEffort} IS NULL OR ${table.launchReasoningEffort} IN ('none','minimal','low','medium','high','xhigh')`,
		),
	],
);

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
		// by the ledger backfill sweep for rows that carry none). All nullable: NULL means "not
		// captured" (runs with none captured, commit-less runs for the line columns) — never zero.
		cachedTokens: integer('cached_tokens'),
		// Soft pointer to the run this one continues (Continue affordance / auto-chain). No FK by
		// design: like project_path, it is denormalized identity that must survive its parent.
		chainedFromRunId: text('chained_from_run_id'),
		commandArgsJson: text('command_args_json'),
		completedAt: integer('completed_at'),
		// 'wall_clock_timeout' | 'initializer_handoff' | 'none' (evaluated, not eligible).
		// NULL = not yet evaluated; the ledger-drift sweep backfills those.
		continuationReason: text('continuation_reason'),
		// Backend-reported cost only. NULL means the provider did not report a positive cost;
		// zero is never presented as a free run.
		costUsd: real('cost_usd'),
		directorCycleId: text('director_cycle_id'),
		driverId: text('driver_id'),
		driverKind: text('driver_kind'),
		driverSha256: text('driver_sha256'),
		durationMs: integer('duration_ms'),
		errorMessage: text('error_message'),
		exitCode: integer('exit_code'),
		filesChanged: integer('files_changed'),
		heartbeatAt: integer('heartbeat_at'),
		id: text('id').primaryKey(),
		// Who caused the run: 'operator' (a person acted, whatever surface it came through) or
		// 'automatic' (aidd decided). Distinct from `source`, which is only the door. NULL means
		// not recorded, and never back-filled by
		// inference from chained_from_run_id / scheduled_task_execution_id.
		initiator: text('initiator'),
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
		// Canonical spelling (backend/src/paths.ts canonicalProjectPath): on Windows a lowercase
		// drive letter and on-disk segment casing, so a CLI-adopted run and a web launch of the
		// same project store one value and every join on this column sees one project.
		projectPath: text('project_path').notNull(),
		provider: text('provider'),
		reasoningEffort: text('reasoning_effort'),
		reasoningTokens: integer('reasoning_tokens'),
		// Set by the per-project revert sweep at boot. NULL means not inspected, or no attributed
		// commit resolved in the project history; zero means every attributed commit resolved and
		// none was undone by a standard revert inside the attribution window.
		revertedCommits: integer('reverted_commits'),
		scheduledTaskExecutionId: text('scheduled_task_execution_id'),
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
		index('idx_runs_scheduled_execution_id').on(table.scheduledTaskExecutionId),
		index('idx_runs_started_at').on(sql`${table.startedAt} DESC`),
		index('idx_runs_status').on(table.status),
		// One follow-up per run: continueRun/maybeAutoChainRun are check-then-launch, so this
		// is the invariant that makes their race harmless — the second concurrent insert fails.
		uniqueIndex('uq_runs_chained_from_run_id')
			.on(table.chainedFromRunId)
			.where(sql`chained_from_run_id IS NOT NULL`),
		foreignKey({
			columns: [table.scheduledTaskExecutionId],
			foreignColumns: [scheduledTaskExecutions.id],
			name: 'fk_runs_scheduled_task_execution_id',
		}).onDelete('set null'),
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
			sql`${table.status} IN ('completed','failed','killed','queued','running','stopped','waiting_approval')`,
		),
		check(
			'ck_runs_mode',
			sql`${table.mode} IN ('audit','coding','director','directive','interview','todo','triumvirate','validate')`,
		),
		check(
			'ck_runs_driver_kind',
			sql`${table.driverKind} IS NULL OR ${table.driverKind} IN ('audit','prompt','recipe-step','skill')`,
		),
		check(
			'ck_runs_backend',
			sql`${table.backend} IN ('claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')`,
		),
		check(
			'ck_runs_initiator',
			sql`${table.initiator} IS NULL OR ${table.initiator} IN ('automatic','operator')`,
		),
		check(
			'ck_runs_command_args_json',
			sql`${table.commandArgsJson} IS NULL OR json_valid(${table.commandArgsJson})`,
		),
		check(
			'ck_runs_continuation_reason',
			sql`${table.continuationReason} IS NULL OR ${table.continuationReason} IN ('initializer_handoff','none','wall_clock_timeout')`,
		),
		check('ck_runs_source', sql`${table.source} IN ('cli','director','scheduled','web')`),
		// Mirrors ck_director_profiles_reasoning_effort, but reasoning_effort is
		// nullable here so NULL is allowed explicitly.
		check(
			'ck_runs_reasoning_effort',
			sql`${table.reasoningEffort} IS NULL OR ${table.reasoningEffort} IN ('none','minimal','low','medium','high','xhigh')`,
		),
	],
);

export const pipelineStepResults = sqliteTable(
	'pipeline_step_results',
	{
		// Attempt identity, written by stepRunner (ordinary dispatch) and autoFixRunner (the
		// remediation launched between two of them). Both NULL on rows that are not attempts —
		// hook rows, skipped steps — and on every row written before 0003. NULL is "no persisted
		// attempt identity", never attempt zero: the report falls back to structural grouping
		// rather than fabricating an ordinal for it.
		attemptKind: text('attempt_kind'),
		attemptNumber: integer('attempt_number'),
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
		stepDefinitionId: text('step_definition_id'),
		stepName: text('step_name').notNull(),
		stepType: text('step_type').notNull(),
	},
	(table) => [
		uniqueIndex('idx_pipeline_step_results_display_order').on(
			table.sessionId,
			table.displayOrder,
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
			sql`${table.status} IN ('completed','failed','queued','running','skipped','stopped')`,
		),
		check(
			'ck_pipeline_step_results_phase',
			sql`${table.phase} IN ('post-hook','pre-hook','step')`,
		),
		check(
			'ck_pipeline_step_results_step_type',
			sql`${table.stepType} IN ('aidd-cli','hook','skill','recipe-ref','shell')`,
		),
		check(
			'ck_pipeline_step_results_attempt_number',
			sql`${table.attemptNumber} IS NULL OR ${table.attemptNumber} >= 1`,
		),
		check(
			'ck_pipeline_step_results_attempt_kind',
			sql`${table.attemptKind} IS NULL OR ${table.attemptKind} IN ('auto-fix','ordinary')`,
		),
	],
);
