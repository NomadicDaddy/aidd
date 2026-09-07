-- Enforce scheduler payload JSON and name the task-project foreign key.

CREATE TABLE scheduled_tasks__new (
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
	CONSTRAINT ck_scheduled_tasks_state CHECK (state IN ('active','archived','completed','paused')),
	CONSTRAINT ck_scheduled_tasks_target_type CHECK (target_type IN ('audit','director','recipe','skill')),
	CONSTRAINT ck_scheduled_tasks_schedule_kind CHECK (schedule_kind IN ('cron','once')),
	CONSTRAINT ck_scheduled_tasks_project_scope CHECK (project_scope IN ('all','explicit','none')),
	CONSTRAINT ck_scheduled_tasks_director_scope
		CHECK (target_type <> 'director' OR project_scope = 'none'),
	CONSTRAINT ck_scheduled_tasks_system_not_archived
		CHECK (system_key IS NULL OR state <> 'archived'),
	CONSTRAINT ck_scheduled_tasks_target_json CHECK (json_valid(target_json))
);
INSERT INTO scheduled_tasks__new SELECT * FROM scheduled_tasks;
DROP TABLE scheduled_tasks;
ALTER TABLE scheduled_tasks__new RENAME TO scheduled_tasks;
CREATE INDEX idx_scheduled_tasks_next_run_at ON scheduled_tasks(next_run_at);
CREATE INDEX idx_scheduled_tasks_state ON scheduled_tasks(state);
CREATE UNIQUE INDEX uq_scheduled_tasks_system_key
	ON scheduled_tasks(system_key) WHERE system_key IS NOT NULL;

CREATE TABLE scheduled_task_executions__new (
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
	CONSTRAINT ck_scheduled_task_executions_trigger CHECK (trigger IN ('catch_up','manual','scheduled')),
	CONSTRAINT ck_scheduled_task_executions_status
		CHECK (status IN ('completed','completed_with_failures','failed','queued','running','skipped')),
	CONSTRAINT ck_scheduled_task_executions_project_scope
		CHECK (project_scope IN ('all','explicit','none')),
	CONSTRAINT ck_scheduled_task_executions_target_json CHECK (json_valid(target_json)),
	CONSTRAINT ck_scheduled_task_executions_project_paths_json
		CHECK (json_valid(project_paths_json)),
	CONSTRAINT ck_scheduled_task_executions_dispatch_errors_json
		CHECK (json_valid(dispatch_errors_json)),
	CONSTRAINT ck_scheduled_task_executions_children_json CHECK (json_valid(children_json))
);
INSERT INTO scheduled_task_executions__new (
	id, task_id, due_at, trigger, target_json, project_paths_json, dispatch_errors_json,
	children_json, project_scope, status, started_at, completed_at
) SELECT
	id, task_id, due_at, trigger, target_json, project_paths_json, dispatch_errors_json,
	children_json, project_scope, status, started_at, completed_at
FROM scheduled_task_executions;
DROP TABLE scheduled_task_executions;
ALTER TABLE scheduled_task_executions__new RENAME TO scheduled_task_executions;
CREATE INDEX idx_scheduled_task_executions_status ON scheduled_task_executions(status);
CREATE INDEX idx_scheduled_task_executions_task_started
	ON scheduled_task_executions(task_id, started_at);

CREATE TABLE scheduled_task_projects__new (
	task_id TEXT NOT NULL,
	project_path TEXT NOT NULL,
	CONSTRAINT fk_scheduled_task_projects_task_id
		FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
);
INSERT INTO scheduled_task_projects__new SELECT * FROM scheduled_task_projects;
DROP TABLE scheduled_task_projects;
ALTER TABLE scheduled_task_projects__new RENAME TO scheduled_task_projects;
CREATE INDEX idx_scheduled_task_projects_project_path
	ON scheduled_task_projects(project_path);
CREATE UNIQUE INDEX uq_scheduled_task_projects_task_path
	ON scheduled_task_projects(task_id, project_path);
