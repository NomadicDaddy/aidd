-- 0001: aidd web control panel schema.
--
-- The complete schema a fresh database is created with. Later migrations extend it by
-- appending to the registry, never by editing this file.

CREATE TABLE director_cycles (
	id TEXT PRIMARY KEY,
	status TEXT NOT NULL DEFAULT 'running',
	fleet_health_score REAL,
	total_suggestions INTEGER NOT NULL DEFAULT 0,
	started_at INTEGER NOT NULL,
	completed_at INTEGER,
	failure_reason TEXT,
	aidd_version TEXT,
	aidd_revision TEXT,
	aidd_dirty INTEGER, scheduled_task_execution_id TEXT
	REFERENCES scheduled_task_executions(id) ON DELETE SET NULL, initiator TEXT CONSTRAINT ck_director_cycles_initiator
	CHECK (initiator IS NULL OR initiator IN ('automatic','operator')), auto_launch TEXT,
	CONSTRAINT ck_director_cycles_status
		CHECK (status IN ('completed','failed','running'))
);

CREATE TABLE pipeline_step_results (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL,
	parent_step_result_id TEXT,
	sequence_number INTEGER NOT NULL,
	display_order INTEGER NOT NULL,
	depth INTEGER NOT NULL DEFAULT 0,
	step_name TEXT NOT NULL,
	step_type TEXT NOT NULL,
	phase TEXT NOT NULL DEFAULT 'step',
	status TEXT NOT NULL DEFAULT 'queued',
	run_id TEXT,
	exit_code INTEGER,
	output_summary TEXT,
	error_message TEXT,
	started_at INTEGER,
	completed_at INTEGER,
	duration_ms INTEGER, step_definition_id TEXT,
	CONSTRAINT fk_pipeline_step_results_session_id_pipeline_sessions
		FOREIGN KEY (session_id) REFERENCES pipeline_sessions(id) ON DELETE CASCADE,
	CONSTRAINT fk_pipeline_step_results_run_id_runs
		FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL,
	CONSTRAINT fk_pipeline_step_results_parent_step_result_id_pipeline_step_results
		FOREIGN KEY (parent_step_result_id) REFERENCES pipeline_step_results(id) ON DELETE CASCADE,
	CONSTRAINT ck_pipeline_step_results_status
		CHECK (status IN ('completed','failed','queued','running','skipped','stopped')),
	CONSTRAINT ck_pipeline_step_results_phase
		CHECK (phase IN ('post-hook','pre-hook','step')),
	CONSTRAINT ck_pipeline_step_results_step_type
		CHECK (step_type IN ('aidd-cli','hook','skill','recipe-ref','shell'))
);

CREATE TABLE director_chat_sessions (
	id TEXT PRIMARY KEY,
	profile_id TEXT NOT NULL,
	title TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	CONSTRAINT fk_director_chat_sessions_profile_id_director_profiles
		FOREIGN KEY (profile_id) REFERENCES director_profiles(id) ON DELETE CASCADE
);

CREATE TABLE director_chat_messages (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL,
	cycle_id TEXT,
	role TEXT NOT NULL,
	content TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	actions TEXT,
	CONSTRAINT fk_director_chat_messages_session_id_director_chat_sessions
		FOREIGN KEY (session_id) REFERENCES director_chat_sessions(id) ON DELETE CASCADE,
	CONSTRAINT fk_director_chat_messages_cycle_id_director_cycles
		FOREIGN KEY (cycle_id) REFERENCES director_cycles(id) ON DELETE SET NULL,
	CONSTRAINT ck_director_chat_messages_role
		CHECK (role IN ('assistant','system','user'))
);

CREATE TABLE app_launches (
	project_path TEXT PRIMARY KEY,
	status TEXT NOT NULL,
	pid INTEGER,
	started_at INTEGER,
	stopped_at INTEGER,
	command TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	CONSTRAINT ck_app_launches_status
		CHECK (status IN ('crashed','running','stopped'))
);

CREATE TABLE settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL,
	updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
	CONSTRAINT ck_settings_value_json CHECK (json_valid(value))
);

CREATE TABLE system_metrics (
	id INTEGER PRIMARY KEY,
	metric_type TEXT NOT NULL,
	value REAL,
	cpu_usage REAL,
	memory_usage REAL,
	heap_used INTEGER,
	heap_total INTEGER,
	rss INTEGER,
	event_loop_latency REAL,
	disk_usage REAL,
	metadata TEXT,
	timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE project_init_failures (
	created_at INTEGER NOT NULL,
	description TEXT,
	error_summary TEXT NOT NULL,
	id TEXT PRIMARY KEY,
	log_path TEXT,
	name TEXT NOT NULL,
	quarantine_path TEXT,
	root TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'open',
	target_path TEXT NOT NULL,
	template TEXT NOT NULL,
	template_url TEXT,
	CONSTRAINT ck_project_init_failures_status CHECK (status IN ('dismissed','open'))
);

CREATE TABLE diary_entries (
	body_md TEXT NOT NULL,
	content_hash TEXT NOT NULL,
	entry_date TEXT NOT NULL,
	file_mtime_ms INTEGER NOT NULL,
	file_path TEXT NOT NULL,
	generated_by TEXT,
	id TEXT PRIMARY KEY,
	indexed_at INTEGER NOT NULL,
	phase TEXT,
	project_name TEXT NOT NULL,
	project_path TEXT NOT NULL,
	summary TEXT,
	title TEXT NOT NULL
);

CREATE TABLE "pipeline_sessions" (
	id TEXT PRIMARY KEY,
	recipe_id TEXT NOT NULL,
	recipe_name TEXT NOT NULL,
	project_path TEXT NOT NULL,
	project_name TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'queued',
	current_step_index INTEGER NOT NULL DEFAULT 0,
	total_steps INTEGER NOT NULL,
	parameters_json TEXT NOT NULL,
	started_at INTEGER NOT NULL,
	completed_at INTEGER,
	duration_ms INTEGER,
	error_message TEXT,
	metadata_only INTEGER NOT NULL DEFAULT 0,
	launch_backend TEXT,
	launch_model TEXT,
	launch_reasoning_effort TEXT, scheduled_task_execution_id TEXT
	REFERENCES scheduled_task_executions(id) ON DELETE SET NULL, recipe_sha256 TEXT, initiator TEXT CONSTRAINT ck_pipeline_sessions_initiator
	CHECK (initiator IS NULL OR initiator IN ('automatic','operator')),
	CONSTRAINT ck_pipeline_sessions_status
		CHECK (status IN ('completed','completed_with_failures','failed','queued','running','stopped')),
	CONSTRAINT ck_pipeline_sessions_launch_backend
		CHECK (launch_backend IS NULL OR launch_backend IN ('claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')),
	CONSTRAINT ck_pipeline_sessions_launch_reasoning_effort
		CHECK (launch_reasoning_effort IS NULL OR launch_reasoning_effort IN ('none','minimal','low','medium','high','xhigh'))
);

CREATE TABLE "director_profiles" (
	id TEXT PRIMARY KEY,
	backend TEXT NOT NULL DEFAULT 'native',
	model TEXT,
	reasoning_effort TEXT NOT NULL DEFAULT 'low',
	role TEXT NOT NULL DEFAULT 'Fleet Director',
	instructions TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	CONSTRAINT ck_director_profiles_backend
		CHECK (backend IN ('claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')),
	CONSTRAINT ck_director_profiles_reasoning_effort
		CHECK (reasoning_effort IN ('none','minimal','low','medium','high','xhigh'))
);

CREATE TABLE scheduled_task_projects (
	task_id TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
	project_path TEXT NOT NULL
);

CREATE TABLE "runs" (
	id TEXT PRIMARY KEY,
	project_path TEXT NOT NULL,
	project_name TEXT NOT NULL,
	backend TEXT NOT NULL,
	model TEXT,
	mode TEXT NOT NULL DEFAULT 'coding',
	status TEXT NOT NULL DEFAULT 'running',
	exit_code INTEGER,
	pid INTEGER,
	log_path TEXT,
	pipeline_session_id TEXT,
	director_cycle_id TEXT,
	scheduled_task_execution_id TEXT,
	source TEXT NOT NULL DEFAULT 'web',
	provider TEXT,
	reasoning_effort TEXT,
	started_at INTEGER NOT NULL,
	completed_at INTEGER,
	duration_ms INTEGER,
	error_message TEXT,
	summary TEXT,
	heartbeat_at INTEGER,
	activity_state TEXT,
	stop_reason TEXT,
	command_args_json TEXT,
	ai_summary TEXT,
	worktree_path TEXT,
	worktree_branch TEXT,
	lines_added INTEGER,
	lines_removed INTEGER,
	files_changed INTEGER,
	input_tokens INTEGER,
	output_tokens INTEGER,
	cached_tokens INTEGER,
	reasoning_tokens INTEGER,
	continuation_reason TEXT,
	chained_from_run_id TEXT,
	aidd_version TEXT,
	aidd_revision TEXT,
	aidd_dirty INTEGER, driver_kind TEXT CONSTRAINT ck_runs_driver_kind
	CHECK (driver_kind IS NULL OR driver_kind IN ('audit','prompt','recipe-step','skill')), driver_id TEXT, driver_sha256 TEXT, cost_usd REAL, reverted_commits INTEGER, initiator TEXT CONSTRAINT ck_runs_initiator
	CHECK (initiator IS NULL OR initiator IN ('automatic','operator')),
	CONSTRAINT fk_runs_pipeline_session_id_pipeline_sessions
		FOREIGN KEY (pipeline_session_id) REFERENCES pipeline_sessions(id) ON DELETE SET NULL,
	CONSTRAINT fk_runs_director_cycle_id_director_cycles
		FOREIGN KEY (director_cycle_id) REFERENCES director_cycles(id) ON DELETE SET NULL,
	CONSTRAINT fk_runs_scheduled_task_execution_id
		FOREIGN KEY (scheduled_task_execution_id)
		REFERENCES scheduled_task_executions(id) ON DELETE SET NULL,
	CONSTRAINT ck_runs_status
		CHECK (status IN ('completed','failed','killed','running','stopped','waiting_approval')),
	CONSTRAINT ck_runs_mode
		CHECK (mode IN ('audit','coding','director','directive','interview','todo','triumvirate','validate')),
	CONSTRAINT ck_runs_backend
		CHECK (backend IN ('claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')),
	CONSTRAINT ck_runs_source CHECK (source IN ('cli','director','scheduled','web')),
	CONSTRAINT ck_runs_reasoning_effort
		CHECK (reasoning_effort IS NULL OR reasoning_effort IN ('none','minimal','low','medium','high','xhigh'))
);

CREATE TABLE "invocation_events" (
	id TEXT PRIMARY KEY,
	resource_type TEXT NOT NULL,
	resource_id TEXT NOT NULL,
	resource_name TEXT NOT NULL,
	source TEXT NOT NULL,
	run_id TEXT,
	session_id TEXT,
	parent_invocation_id TEXT,
	parent_resource_type TEXT,
	parent_resource_id TEXT,
	project_path TEXT NOT NULL,
	project_name TEXT NOT NULL,
	backend TEXT,
	model TEXT,
	args_present INTEGER NOT NULL DEFAULT 0,
	started_at INTEGER NOT NULL,
	completed_at INTEGER,
	duration_ms INTEGER,
	status TEXT NOT NULL DEFAULT 'running',
	exit_code INTEGER,
	error_message TEXT, resource_sha256 TEXT,
	CONSTRAINT fk_invocation_events_run_id_runs
		FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL,
	CONSTRAINT fk_invocation_events_session_id_pipeline_sessions
		FOREIGN KEY (session_id) REFERENCES pipeline_sessions(id) ON DELETE SET NULL,
	CONSTRAINT fk_invocation_events_parent_invocation_id_invocation_events
		FOREIGN KEY (parent_invocation_id) REFERENCES "invocation_events"(id) ON DELETE SET NULL,
	CONSTRAINT ck_invocation_events_resource_type CHECK (resource_type IN ('skill','recipe','run')),
	CONSTRAINT ck_invocation_events_source
		CHECK (source IN ('cli','recipe-step','scheduled','web')),
	CONSTRAINT ck_invocation_events_status
		CHECK (status IN ('completed','failed','killed','running','stopped')),
	CONSTRAINT ck_invocation_events_parent_resource_type
		CHECK (parent_resource_type IS NULL OR parent_resource_type IN ('skill','recipe','run')),
	CONSTRAINT ck_invocation_events_backend
		CHECK (backend IS NULL OR backend IN ('claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode'))
);

CREATE TABLE "scheduled_tasks" (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	state TEXT NOT NULL DEFAULT 'active',
	system_key TEXT,
	target_type TEXT NOT NULL,
	target_json TEXT NOT NULL,
	project_scope TEXT NOT NULL DEFAULT 'all',
	schedule_kind TEXT NOT NULL,
	schedule_expression TEXT,
	timezone TEXT NOT NULL,
	next_run_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	archived_at INTEGER,
	CONSTRAINT ck_scheduled_tasks_state
		CHECK (state IN ('active','archived','completed','paused')),
	CONSTRAINT ck_scheduled_tasks_target_type
		CHECK (target_type IN ('audit','director','recipe','skill')),
	CONSTRAINT ck_scheduled_tasks_schedule_kind CHECK (schedule_kind IN ('cron','once')),
	CONSTRAINT ck_scheduled_tasks_project_scope
		CHECK (project_scope IN ('all','explicit','none')),
	CONSTRAINT ck_scheduled_tasks_director_scope
		CHECK (target_type <> 'director' OR project_scope = 'none'),
	CONSTRAINT ck_scheduled_tasks_system_not_archived
		CHECK (system_key IS NULL OR state <> 'archived')
);

CREATE TABLE "scheduled_task_executions" (
	id TEXT PRIMARY KEY,
	task_id TEXT NOT NULL,
	due_at INTEGER NOT NULL,
	trigger TEXT NOT NULL,
	target_json TEXT NOT NULL,
	project_paths_json TEXT NOT NULL,
	dispatch_errors_json TEXT NOT NULL DEFAULT '[]',
	children_json TEXT NOT NULL DEFAULT '[]',
	project_scope TEXT NOT NULL DEFAULT 'all',
	status TEXT NOT NULL DEFAULT 'queued',
	started_at INTEGER NOT NULL,
	completed_at INTEGER,
	CONSTRAINT fk_scheduled_task_executions_task_id
		FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
	CONSTRAINT ck_scheduled_task_executions_trigger
		CHECK (trigger IN ('catch_up','manual','scheduled')),
	CONSTRAINT ck_scheduled_task_executions_status
		CHECK (status IN ('completed','completed_with_failures','failed','queued','running','skipped')),
	CONSTRAINT ck_scheduled_task_executions_project_scope
		CHECK (project_scope IN ('all','explicit','none'))
);

CREATE TABLE "suggestions" (
	id TEXT PRIMARY KEY,
	cycle_id TEXT NOT NULL,
	project_id TEXT,
	task_type TEXT NOT NULL,
	risk_level TEXT NOT NULL,
	title TEXT NOT NULL,
	description TEXT NOT NULL,
	reasoning TEXT NOT NULL,
	confidence REAL,
	evidence TEXT,
	suggested_args TEXT,
	suggested_recipe TEXT,
	status TEXT NOT NULL DEFAULT 'pending',
	resolved_at INTEGER,
	dismissed_by TEXT,
	launched_run_id TEXT,
	launched_pipeline_session_id TEXT,
	created_at INTEGER NOT NULL, rank INTEGER,
	CONSTRAINT fk_suggestions_launched_pipeline_session_id_pipeline_sessions
		FOREIGN KEY (launched_pipeline_session_id) REFERENCES pipeline_sessions(id) ON DELETE SET NULL,
	CONSTRAINT fk_suggestions_launched_run_id_runs
		FOREIGN KEY (launched_run_id) REFERENCES runs(id) ON DELETE SET NULL,
	CONSTRAINT fk_suggestions_cycle_id_director_cycles
		FOREIGN KEY (cycle_id) REFERENCES director_cycles(id) ON DELETE CASCADE,
	CONSTRAINT ck_suggestions_status
		CHECK (status IN ('dismissed','launched','launching','pending')),
	CONSTRAINT ck_suggestions_risk_level
		CHECK (risk_level IN ('HIGH','LOW','MEDIUM')),
	CONSTRAINT ck_suggestions_task_type
		CHECK (
			task_type IN (
				'artifact_maintenance',
				'audit_backlog',
				'audit_maintenance',
				'audit_remediation',
				'ci_failure',
				'code_quality_trend',
				'dependency_hygiene',
				'drift_detection',
				'feature_completion',
				'pr_followup',
				'project_intake',
				'remediation_backlog',
				'smoke_test_failure',
				'stale_project',
				'unused_code'
			)
		),
	CONSTRAINT ck_suggestions_dismissed_by
		CHECK (dismissed_by IS NULL OR dismissed_by IN ('user','cycle_retire'))
);

CREATE INDEX idx_director_cycles_started_at
	ON director_cycles(started_at DESC);

CREATE UNIQUE INDEX idx_pipeline_step_results_display_order
	ON pipeline_step_results(session_id, display_order);

CREATE INDEX idx_pipeline_step_results_parent_step_result_id
	ON pipeline_step_results(parent_step_result_id);

CREATE INDEX idx_pipeline_step_results_run_id
	ON pipeline_step_results(run_id);

CREATE INDEX idx_pipeline_step_results_session_id
	ON pipeline_step_results(session_id);

CREATE INDEX idx_director_chat_sessions_updated_at
	ON director_chat_sessions(updated_at);

CREATE INDEX idx_director_chat_sessions_profile_id
	ON director_chat_sessions(profile_id);

CREATE INDEX idx_director_chat_messages_session_id_created_at
	ON director_chat_messages(session_id, created_at);

CREATE INDEX idx_director_chat_messages_cycle_id
	ON director_chat_messages(cycle_id);

CREATE INDEX idx_app_launches_status ON app_launches(status);

CREATE INDEX idx_system_metrics_type_ts ON system_metrics(metric_type, timestamp);

CREATE INDEX idx_project_init_failures_status ON project_init_failures(status);

CREATE INDEX idx_project_init_failures_created_at ON project_init_failures(created_at);

CREATE UNIQUE INDEX idx_diary_entries_project_date
	ON diary_entries(project_path, entry_date);

CREATE INDEX idx_diary_entries_entry_date ON diary_entries(entry_date);

CREATE INDEX idx_pipeline_sessions_status ON pipeline_sessions(status);

CREATE INDEX idx_pipeline_sessions_project_path ON pipeline_sessions(project_path);

CREATE INDEX idx_pipeline_sessions_recipe_id ON pipeline_sessions(recipe_id);

CREATE INDEX idx_pipeline_sessions_started_at ON pipeline_sessions(started_at DESC);

CREATE UNIQUE INDEX uq_scheduled_task_projects_task_path
	ON scheduled_task_projects(task_id, project_path);

CREATE INDEX idx_scheduled_task_projects_project_path
	ON scheduled_task_projects(project_path);

CREATE INDEX idx_pipeline_sessions_scheduled_execution_id
	ON pipeline_sessions(scheduled_task_execution_id);

CREATE INDEX idx_runs_status ON runs(status);

CREATE INDEX idx_runs_project_path ON runs(project_path);

CREATE INDEX idx_runs_started_at ON runs(started_at DESC);

CREATE INDEX idx_runs_pipeline_session_id ON runs(pipeline_session_id);

CREATE INDEX idx_runs_director_cycle_id ON runs(director_cycle_id);

CREATE INDEX idx_runs_scheduled_execution_id ON runs(scheduled_task_execution_id);

CREATE UNIQUE INDEX uq_runs_chained_from_run_id
	ON runs(chained_from_run_id) WHERE chained_from_run_id IS NOT NULL;

CREATE INDEX idx_invocation_events_resource_type_resource_id
	ON invocation_events(resource_type, resource_id);

CREATE INDEX idx_invocation_events_started_at ON invocation_events(started_at DESC);

CREATE INDEX idx_invocation_events_status ON invocation_events(status);

CREATE INDEX idx_invocation_events_run_id ON invocation_events(run_id);

CREATE INDEX idx_invocation_events_session_id ON invocation_events(session_id);

CREATE INDEX idx_invocation_events_parent_invocation_id
	ON invocation_events(parent_invocation_id);

CREATE INDEX idx_invocation_events_project_path ON invocation_events(project_path);

CREATE INDEX idx_scheduled_tasks_state ON scheduled_tasks(state);

CREATE INDEX idx_scheduled_tasks_next_run_at ON scheduled_tasks(next_run_at);

CREATE UNIQUE INDEX uq_scheduled_tasks_system_key
	ON scheduled_tasks(system_key) WHERE system_key IS NOT NULL;

CREATE INDEX idx_director_cycles_scheduled_execution_id
	ON director_cycles(scheduled_task_execution_id);

CREATE INDEX idx_scheduled_task_executions_task_started
	ON scheduled_task_executions(task_id, started_at);

CREATE INDEX idx_scheduled_task_executions_status ON scheduled_task_executions(status);

CREATE INDEX idx_suggestions_status ON suggestions(status);

CREATE INDEX idx_suggestions_cycle_id ON suggestions(cycle_id);

CREATE INDEX idx_suggestions_launched_run_id ON suggestions(launched_run_id);

CREATE INDEX idx_suggestions_launched_pipeline_session_id
	ON suggestions(launched_pipeline_session_id);

CREATE INDEX idx_suggestions_project_id ON suggestions(project_id);

CREATE INDEX idx_suggestions_status_rank ON suggestions(status, rank);
