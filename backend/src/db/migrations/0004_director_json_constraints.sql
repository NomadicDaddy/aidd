-- Enforce the Director JSON contracts and give the scheduled-execution FK a stable name.

CREATE TABLE director_cycles__new (
	id TEXT PRIMARY KEY,
	status TEXT NOT NULL DEFAULT 'running',
	fleet_health_score REAL,
	total_suggestions INTEGER NOT NULL DEFAULT 0,
	started_at INTEGER NOT NULL,
	completed_at INTEGER,
	failure_reason TEXT,
	aidd_version TEXT,
	aidd_revision TEXT,
	aidd_dirty INTEGER,
	scheduled_task_execution_id TEXT,
	initiator TEXT,
	auto_launch TEXT,
	auto_launch_state TEXT,
	auto_launch_bounds TEXT,
	auto_launch_claimed_at INTEGER,
	CONSTRAINT fk_director_cycles_scheduled_task_execution_id
		FOREIGN KEY (scheduled_task_execution_id)
		REFERENCES scheduled_task_executions(id) ON DELETE SET NULL,
	CONSTRAINT ck_director_cycles_initiator
		CHECK (initiator IS NULL OR initiator IN ('automatic','operator')),
	CONSTRAINT ck_director_cycles_auto_launch_state
		CHECK (auto_launch_state IS NULL OR auto_launch_state IN ('disabled','finalized','pending','processing')),
	CONSTRAINT ck_director_cycles_status CHECK (status IN ('completed','failed','running')),
	CONSTRAINT ck_director_cycles_auto_launch_json
		CHECK (auto_launch IS NULL OR json_valid(auto_launch)),
	CONSTRAINT ck_director_cycles_auto_launch_bounds_json
		CHECK (auto_launch_bounds IS NULL OR json_valid(auto_launch_bounds))
);
INSERT INTO director_cycles__new SELECT * FROM director_cycles;
DROP TABLE director_cycles;
ALTER TABLE director_cycles__new RENAME TO director_cycles;
CREATE INDEX idx_director_cycles_scheduled_execution_id
	ON director_cycles(scheduled_task_execution_id);
CREATE INDEX idx_director_cycles_started_at ON director_cycles(started_at DESC);

CREATE TABLE director_chat_messages__new (
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
	CONSTRAINT ck_director_chat_messages_role CHECK (role IN ('assistant','system','user')),
	CONSTRAINT ck_director_chat_messages_actions_json
		CHECK (actions IS NULL OR json_valid(actions))
);
INSERT INTO director_chat_messages__new SELECT * FROM director_chat_messages;
DROP TABLE director_chat_messages;
ALTER TABLE director_chat_messages__new RENAME TO director_chat_messages;
CREATE INDEX idx_director_chat_messages_cycle_id ON director_chat_messages(cycle_id);
CREATE INDEX idx_director_chat_messages_session_id_created_at
	ON director_chat_messages(session_id, created_at);

CREATE TABLE suggestions__new (
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
	created_at INTEGER NOT NULL,
	rank INTEGER,
	CONSTRAINT fk_suggestions_launched_pipeline_session_id_pipeline_sessions
		FOREIGN KEY (launched_pipeline_session_id)
		REFERENCES pipeline_sessions(id) ON DELETE SET NULL,
	CONSTRAINT fk_suggestions_launched_run_id_runs
		FOREIGN KEY (launched_run_id) REFERENCES runs(id) ON DELETE SET NULL,
	CONSTRAINT fk_suggestions_cycle_id_director_cycles
		FOREIGN KEY (cycle_id) REFERENCES director_cycles(id) ON DELETE CASCADE,
	CONSTRAINT ck_suggestions_status CHECK (status IN ('dismissed','launched','launching','pending')),
	CONSTRAINT ck_suggestions_risk_level CHECK (risk_level IN ('HIGH','LOW','MEDIUM')),
	CONSTRAINT ck_suggestions_task_type CHECK (
		task_type IN (
			'artifact_maintenance','audit_backlog','audit_maintenance','audit_remediation',
			'ci_failure','code_quality_trend','dependency_hygiene','drift_detection',
			'feature_completion','pr_followup','project_intake','remediation_backlog',
			'smoke_test_failure','stale_project','unused_code'
		)
	),
	CONSTRAINT ck_suggestions_dismissed_by
		CHECK (dismissed_by IS NULL OR dismissed_by IN ('user','cycle_retire')),
	CONSTRAINT ck_suggestions_evidence_json CHECK (evidence IS NULL OR json_valid(evidence)),
	CONSTRAINT ck_suggestions_suggested_args_json
		CHECK (suggested_args IS NULL OR json_valid(suggested_args))
);
INSERT INTO suggestions__new SELECT * FROM suggestions;
DROP TABLE suggestions;
ALTER TABLE suggestions__new RENAME TO suggestions;
CREATE INDEX idx_suggestions_cycle_id ON suggestions(cycle_id);
CREATE INDEX idx_suggestions_launched_pipeline_session_id
	ON suggestions(launched_pipeline_session_id);
CREATE INDEX idx_suggestions_launched_run_id ON suggestions(launched_run_id);
CREATE INDEX idx_suggestions_project_id ON suggestions(project_id);
CREATE INDEX idx_suggestions_status ON suggestions(status);
CREATE INDEX idx_suggestions_status_rank ON suggestions(status, rank);
