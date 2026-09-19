-- Admit the free-form 'directive' scheduled target alongside the catalog-backed ones.

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
	CONSTRAINT ck_scheduled_tasks_target_type
		CHECK (target_type IN ('audit','directive','director','recipe','skill')),
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
