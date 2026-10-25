-- Admit finding_consolidation as a Director suggestion task type: completed findings to fold.

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
			'feature_completion','finding_consolidation','pr_followup','project_intake',
			'remediation_backlog','smoke_test_failure','stale_project','unused_code'
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
