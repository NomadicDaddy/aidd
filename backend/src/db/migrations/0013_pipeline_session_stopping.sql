-- 0013: a stopped session waits for its runs. 'stopping' is the session between the stop request
-- and the moment every run it owns has ended at its iteration boundary; stop_requested_at is when
-- the request arrived. NULL means no stop was requested, which is every row written before this.

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
	stop_requested_at INTEGER,
	CONSTRAINT fk_pipeline_sessions_scheduled_task_execution_id
		FOREIGN KEY (scheduled_task_execution_id)
		REFERENCES scheduled_task_executions(id) ON DELETE SET NULL,
	CONSTRAINT ck_pipeline_sessions_initiator
		CHECK (initiator IS NULL OR initiator IN ('automatic','operator')),
	CONSTRAINT ck_pipeline_sessions_status
		CHECK (status IN ('completed','completed_with_failures','failed','queued','running','stopped','stopping')),
	CONSTRAINT ck_pipeline_sessions_launch_backend CHECK (
		launch_backend IS NULL OR launch_backend IN (
			'claude-code','cline','codex','grok','kilocode','lmstudio','native','ollama','openai','opencode'
		)
	),
	CONSTRAINT ck_pipeline_sessions_launch_reasoning_effort
		CHECK (launch_reasoning_effort IS NULL OR launch_reasoning_effort IN ('none','minimal','low','medium','high','xhigh')),
	CONSTRAINT ck_pipeline_sessions_parameters_json CHECK (json_valid(parameters_json))
);
INSERT INTO pipeline_sessions__new (
	id, recipe_id, recipe_name, project_path, project_name, status, current_step_index, total_steps,
	parameters_json, started_at, completed_at, duration_ms, error_message, metadata_only,
	launch_backend, launch_model, launch_reasoning_effort, scheduled_task_execution_id,
	recipe_sha256, initiator, stop_requested_at
)
SELECT
	id, recipe_id, recipe_name, project_path, project_name, status, current_step_index, total_steps,
	parameters_json, started_at, completed_at, duration_ms, error_message, metadata_only,
	launch_backend, launch_model, launch_reasoning_effort, scheduled_task_execution_id,
	recipe_sha256, initiator, NULL
FROM pipeline_sessions;
DROP TABLE pipeline_sessions;
ALTER TABLE pipeline_sessions__new RENAME TO pipeline_sessions;
CREATE INDEX idx_pipeline_sessions_project_path ON pipeline_sessions(project_path);
CREATE INDEX idx_pipeline_sessions_recipe_id ON pipeline_sessions(recipe_id);
CREATE INDEX idx_pipeline_sessions_scheduled_execution_id
	ON pipeline_sessions(scheduled_task_execution_id);
CREATE INDEX idx_pipeline_sessions_started_at ON pipeline_sessions(started_at DESC);
CREATE INDEX idx_pipeline_sessions_status ON pipeline_sessions(status);
