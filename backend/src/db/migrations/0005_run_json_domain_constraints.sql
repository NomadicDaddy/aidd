-- Enforce pipeline/run JSON and finite continuation domains, and name the pipeline FK.

CREATE TABLE pipeline_sessions__new (
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
	launch_reasoning_effort TEXT,
	scheduled_task_execution_id TEXT,
	recipe_sha256 TEXT,
	initiator TEXT,
	CONSTRAINT fk_pipeline_sessions_scheduled_task_execution_id
		FOREIGN KEY (scheduled_task_execution_id)
		REFERENCES scheduled_task_executions(id) ON DELETE SET NULL,
	CONSTRAINT ck_pipeline_sessions_initiator
		CHECK (initiator IS NULL OR initiator IN ('automatic','operator')),
	CONSTRAINT ck_pipeline_sessions_status
		CHECK (status IN ('completed','completed_with_failures','failed','queued','running','stopped')),
	CONSTRAINT ck_pipeline_sessions_launch_backend CHECK (
		launch_backend IS NULL OR launch_backend IN (
			'claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode'
		)
	),
	CONSTRAINT ck_pipeline_sessions_launch_reasoning_effort
		CHECK (launch_reasoning_effort IS NULL OR launch_reasoning_effort IN ('none','minimal','low','medium','high','xhigh')),
	CONSTRAINT ck_pipeline_sessions_parameters_json CHECK (json_valid(parameters_json))
);
INSERT INTO pipeline_sessions__new SELECT * FROM pipeline_sessions;
DROP TABLE pipeline_sessions;
ALTER TABLE pipeline_sessions__new RENAME TO pipeline_sessions;
CREATE INDEX idx_pipeline_sessions_project_path ON pipeline_sessions(project_path);
CREATE INDEX idx_pipeline_sessions_recipe_id ON pipeline_sessions(recipe_id);
CREATE INDEX idx_pipeline_sessions_scheduled_execution_id
	ON pipeline_sessions(scheduled_task_execution_id);
CREATE INDEX idx_pipeline_sessions_started_at ON pipeline_sessions(started_at DESC);
CREATE INDEX idx_pipeline_sessions_status ON pipeline_sessions(status);

CREATE TABLE runs__new (
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
	aidd_dirty INTEGER,
	driver_kind TEXT,
	driver_id TEXT,
	driver_sha256 TEXT,
	cost_usd REAL,
	reverted_commits INTEGER,
	initiator TEXT,
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
	CONSTRAINT ck_runs_backend CHECK (
		backend IN ('claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')
	),
	CONSTRAINT ck_runs_source CHECK (source IN ('cli','director','scheduled','web')),
	CONSTRAINT ck_runs_reasoning_effort
		CHECK (reasoning_effort IS NULL OR reasoning_effort IN ('none','minimal','low','medium','high','xhigh')),
	CONSTRAINT ck_runs_driver_kind
		CHECK (driver_kind IS NULL OR driver_kind IN ('audit','prompt','recipe-step','skill')),
	CONSTRAINT ck_runs_initiator
		CHECK (initiator IS NULL OR initiator IN ('automatic','operator')),
	CONSTRAINT ck_runs_command_args_json
		CHECK (command_args_json IS NULL OR json_valid(command_args_json)),
	CONSTRAINT ck_runs_continuation_reason
		CHECK (continuation_reason IS NULL OR continuation_reason IN ('initializer_handoff','none','wall_clock_timeout'))
);
INSERT INTO runs__new (
	id, project_path, project_name, backend, model, mode, status, exit_code, pid, log_path,
	pipeline_session_id, director_cycle_id, scheduled_task_execution_id, source, provider,
	reasoning_effort, started_at, completed_at, duration_ms, error_message, summary, heartbeat_at,
	activity_state, stop_reason, command_args_json, ai_summary, worktree_path, worktree_branch,
	lines_added, lines_removed, files_changed, input_tokens, output_tokens, cached_tokens,
	reasoning_tokens, continuation_reason, chained_from_run_id, aidd_version, aidd_revision,
	aidd_dirty, driver_kind, driver_id, driver_sha256, cost_usd, reverted_commits, initiator
) SELECT
	id, project_path, project_name, backend, model, mode, status, exit_code, pid, log_path,
	pipeline_session_id, director_cycle_id, scheduled_task_execution_id, source, provider,
	reasoning_effort, started_at, completed_at, duration_ms, error_message, summary, heartbeat_at,
	activity_state, stop_reason, command_args_json, ai_summary, worktree_path, worktree_branch,
	lines_added, lines_removed, files_changed, input_tokens, output_tokens, cached_tokens,
	reasoning_tokens, continuation_reason, chained_from_run_id, aidd_version, aidd_revision,
	aidd_dirty, driver_kind, driver_id, driver_sha256, cost_usd, reverted_commits, initiator
FROM runs;
DROP TABLE runs;
ALTER TABLE runs__new RENAME TO runs;
CREATE INDEX idx_runs_director_cycle_id ON runs(director_cycle_id);
CREATE INDEX idx_runs_pipeline_session_id ON runs(pipeline_session_id);
CREATE INDEX idx_runs_project_path ON runs(project_path);
CREATE INDEX idx_runs_scheduled_execution_id ON runs(scheduled_task_execution_id);
CREATE INDEX idx_runs_started_at ON runs(started_at DESC);
CREATE INDEX idx_runs_status ON runs(status);
CREATE UNIQUE INDEX uq_runs_chained_from_run_id
	ON runs(chained_from_run_id) WHERE chained_from_run_id IS NOT NULL;
