-- Constrain the finite metric/diary domains and the optional metrics JSON payload.

CREATE TABLE system_metrics__new (
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
	timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
	CONSTRAINT ck_system_metrics_metric_type CHECK (
		metric_type = 'system' OR metric_type IN (
			'web-vital-cls','web-vital-fcp','web-vital-inp','web-vital-lcp','web-vital-ttfb'
		)
	),
	CONSTRAINT ck_system_metrics_metadata_json
		CHECK (metadata IS NULL OR json_valid(metadata))
);
INSERT INTO system_metrics__new SELECT * FROM system_metrics;
DROP TABLE system_metrics;
ALTER TABLE system_metrics__new RENAME TO system_metrics;
CREATE INDEX idx_system_metrics_type_ts ON system_metrics(metric_type, timestamp);

CREATE TABLE diary_entries__new (
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
	title TEXT NOT NULL,
	CONSTRAINT ck_diary_entries_phase CHECK (
		phase IS NULL OR phase IN (
			'Architecture','Backend','Bugfix','Collector','DevOps','Frontend',
			'Research','Template','Tooling'
		)
	)
);
INSERT INTO diary_entries__new SELECT * FROM diary_entries;
DROP TABLE diary_entries;
ALTER TABLE diary_entries__new RENAME TO diary_entries;
CREATE UNIQUE INDEX idx_diary_entries_project_date
	ON diary_entries(project_path, entry_date);
CREATE INDEX idx_diary_entries_entry_date ON diary_entries(entry_date);
