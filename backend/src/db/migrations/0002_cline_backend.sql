-- Add the Cline CLI to every persisted backend constraint.

CREATE TABLE pipeline_sessions_new (
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
	CONSTRAINT ck_pipeline_sessions_status
		CHECK (status IN ('completed','completed_with_failures','failed','queued','running','stopped')),
	CONSTRAINT ck_pipeline_sessions_launch_backend
		CHECK (launch_backend IS NULL OR launch_backend IN ('claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')),
	CONSTRAINT ck_pipeline_sessions_launch_reasoning_effort
		CHECK (launch_reasoning_effort IS NULL OR launch_reasoning_effort IN ('none','minimal','low','medium','high','xhigh'))
);

INSERT INTO pipeline_sessions_new (
	id, recipe_id, recipe_name, project_path, project_name, status, current_step_index,
	total_steps, parameters_json, started_at, completed_at, duration_ms, error_message,
	metadata_only, launch_backend, launch_model, launch_reasoning_effort
)
SELECT
	id, recipe_id, recipe_name, project_path, project_name, status, current_step_index,
	total_steps, parameters_json, started_at, completed_at, duration_ms, error_message,
	metadata_only, launch_backend, launch_model, launch_reasoning_effort
FROM pipeline_sessions;

DROP TABLE pipeline_sessions;
ALTER TABLE pipeline_sessions_new RENAME TO pipeline_sessions;
CREATE INDEX idx_pipeline_sessions_status ON pipeline_sessions(status);
CREATE INDEX idx_pipeline_sessions_project_path ON pipeline_sessions(project_path);
CREATE INDEX idx_pipeline_sessions_recipe_id ON pipeline_sessions(recipe_id);
CREATE INDEX idx_pipeline_sessions_started_at ON pipeline_sessions(started_at DESC);

CREATE TABLE director_profiles_new (
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

INSERT INTO director_profiles_new (
	id, backend, model, reasoning_effort, role, instructions, created_at, updated_at
)
SELECT id, backend, model, reasoning_effort, role, instructions, created_at, updated_at
FROM director_profiles;

DROP TABLE director_profiles;
ALTER TABLE director_profiles_new RENAME TO director_profiles;

CREATE TABLE runs_new (
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
	CONSTRAINT fk_runs_pipeline_session_id_pipeline_sessions
		FOREIGN KEY (pipeline_session_id) REFERENCES pipeline_sessions(id) ON DELETE SET NULL,
	CONSTRAINT fk_runs_director_cycle_id_director_cycles
		FOREIGN KEY (director_cycle_id) REFERENCES director_cycles(id) ON DELETE SET NULL,
	CONSTRAINT ck_runs_status
		CHECK (status IN ('completed','failed','killed','running','stopped','waiting_approval')),
	CONSTRAINT ck_runs_mode
		CHECK (mode IN ('audit','coding','director','directive','interview','todo','triumvirate','validate')),
	CONSTRAINT ck_runs_backend
		CHECK (backend IN ('claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode')),
	CONSTRAINT ck_runs_source
		CHECK (source IN ('cli','web','director')),
	CONSTRAINT ck_runs_reasoning_effort
		CHECK (reasoning_effort IS NULL OR reasoning_effort IN ('none','minimal','low','medium','high','xhigh'))
);

INSERT INTO runs_new (
	id, project_path, project_name, backend, model, mode, status, exit_code, pid, log_path,
	pipeline_session_id, director_cycle_id, source, provider, reasoning_effort, started_at,
	completed_at, duration_ms, error_message, summary, heartbeat_at, activity_state, stop_reason,
	command_args_json, ai_summary, worktree_path, worktree_branch, lines_added, lines_removed,
	files_changed, input_tokens, output_tokens, cached_tokens, reasoning_tokens,
	continuation_reason, chained_from_run_id, aidd_version, aidd_revision, aidd_dirty
)
SELECT
	id, project_path, project_name, backend, model, mode, status, exit_code, pid, log_path,
	pipeline_session_id, director_cycle_id, source, provider, reasoning_effort, started_at,
	completed_at, duration_ms, error_message, summary, heartbeat_at, activity_state, stop_reason,
	command_args_json, ai_summary, worktree_path, worktree_branch, lines_added, lines_removed,
	files_changed, input_tokens, output_tokens, cached_tokens, reasoning_tokens,
	continuation_reason, chained_from_run_id, aidd_version, aidd_revision, aidd_dirty
FROM runs;

DROP TABLE runs;
ALTER TABLE runs_new RENAME TO runs;
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_project_path ON runs(project_path);
CREATE INDEX idx_runs_started_at ON runs(started_at DESC);
CREATE INDEX idx_runs_pipeline_session_id ON runs(pipeline_session_id);
CREATE INDEX idx_runs_director_cycle_id ON runs(director_cycle_id);
CREATE UNIQUE INDEX uq_runs_chained_from_run_id
	ON runs(chained_from_run_id) WHERE chained_from_run_id IS NOT NULL;

CREATE TABLE invocation_events_new (
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
	error_message TEXT,
	CONSTRAINT fk_invocation_events_run_id_runs
		FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL,
	CONSTRAINT fk_invocation_events_session_id_pipeline_sessions
		FOREIGN KEY (session_id) REFERENCES pipeline_sessions(id) ON DELETE SET NULL,
	CONSTRAINT fk_invocation_events_parent_invocation_id_invocation_events
		FOREIGN KEY (parent_invocation_id) REFERENCES invocation_events_new(id) ON DELETE SET NULL,
	CONSTRAINT ck_invocation_events_resource_type
		CHECK (resource_type IN ('skill','recipe','run')),
	CONSTRAINT ck_invocation_events_source
		CHECK (source IN ('cli','recipe-step','web')),
	CONSTRAINT ck_invocation_events_status
		CHECK (status IN ('completed','failed','killed','running','stopped')),
	CONSTRAINT ck_invocation_events_parent_resource_type
		CHECK (parent_resource_type IS NULL OR parent_resource_type IN ('skill','recipe','run')),
	CONSTRAINT ck_invocation_events_backend
		CHECK (backend IS NULL OR backend IN ('claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode'))
);

INSERT INTO invocation_events_new (
	id, resource_type, resource_id, resource_name, source, run_id, session_id,
	parent_invocation_id, parent_resource_type, parent_resource_id, project_path, project_name,
	backend, model, args_present, started_at, completed_at, duration_ms, status, exit_code,
	error_message
)
SELECT
	id, resource_type, resource_id, resource_name, source, run_id, session_id,
	parent_invocation_id, parent_resource_type, parent_resource_id, project_path, project_name,
	backend, model, args_present, started_at, completed_at, duration_ms, status, exit_code,
	error_message
FROM invocation_events;

DROP TABLE invocation_events;
ALTER TABLE invocation_events_new RENAME TO invocation_events;
CREATE INDEX idx_invocation_events_resource_type_resource_id
	ON invocation_events(resource_type, resource_id);
CREATE INDEX idx_invocation_events_started_at ON invocation_events(started_at DESC);
CREATE INDEX idx_invocation_events_status ON invocation_events(status);
CREATE INDEX idx_invocation_events_run_id ON invocation_events(run_id);
CREATE INDEX idx_invocation_events_session_id ON invocation_events(session_id);
CREATE INDEX idx_invocation_events_parent_invocation_id
	ON invocation_events(parent_invocation_id);
CREATE INDEX idx_invocation_events_project_path ON invocation_events(project_path);
