import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Tracks app processes launched from the project UI. Keyed by absolute project
// path because projects are not first-class DB rows (see schema header).
export const appLaunches = sqliteTable(
	'app_launches',
	{
		command: text('command').notNull(),
		pid: integer('pid'),
		// Canonical spelling (see canonicalProjectPath in paths.ts); the resolution chokepoints
		// in services/project/lifecycle.ts hand every writer that value.
		projectPath: text('project_path').primaryKey(),
		startedAt: integer('started_at'),
		status: text('status').notNull(),
		stoppedAt: integer('stopped_at'),
		updatedAt: integer('updated_at').notNull(),
	},
	(table) => [
		index('idx_app_launches_status').on(table.status),
		check('ck_app_launches_status', sql`${table.status} IN ('crashed','running','stopped')`),
	],
);

// Failed project-template inits. A scaffold that errors is quarantined off the target
// path (so the fleet never sees a broken .aidd-less tree) and recorded here, so the
// failure stays visible in the fleet with the inputs needed to retry. Keyed by a synthetic
// id because the would-be project never reached a managed path. Open rows surface as
// failed-init fleet entries; dismissed rows are retained for audit but hidden.
export const projectInitFailures = sqliteTable(
	'project_init_failures',
	{
		createdAt: integer('created_at').notNull(),
		description: text('description'),
		errorSummary: text('error_summary').notNull(),
		id: text('id').primaryKey(),
		logPath: text('log_path'),
		name: text('name').notNull(),
		quarantinePath: text('quarantine_path'),
		root: text('root').notNull(),
		status: text('status').notNull().default('open'),
		targetPath: text('target_path').notNull(),
		template: text('template').notNull(),
		// GitHub template source (owner/repo[#ref]) for github: failures; null for
		// registered templates, which retry by name instead.
		templateUrl: text('template_url'),
	},
	(table) => [
		index('idx_project_init_failures_status').on(table.status),
		index('idx_project_init_failures_created_at').on(table.createdAt),
		check('ck_project_init_failures_status', sql`${table.status} IN ('dismissed','open')`),
	],
);

// settings.value stores JSON blobs; the json_valid CHECK constraint prevents
// non-JSON or partially-serialized text from being persisted. updatedAt defaults
// to the current unix-millis so writers cannot accidentally insert rows with a
// stale or zero timestamp by omitting the column.
export const settings = sqliteTable(
	'settings',
	{
		key: text('key').primaryKey(),
		updatedAt: integer('updated_at')
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		value: text('value').notNull(),
	},
	(table) => [check('ck_settings_value_json', sql`json_valid(${table.value})`)],
);

// Time-series of runtime performance samples. Two row shapes share the table, distinguished by
// metricType: a 'system' snapshot fills the resource columns (cpu/memory/heap/rss/eventLoop/disk)
// and leaves value null; a 'web-vital-*' row carries the single measured value plus a JSON
// metadata blob (rating, url, navigationType). This is the on-disk evidence that was missing —
// without it, "where does time go" could only be guessed at. Indexed by (metricType, timestamp)
// because every read is "recent rows of one type".
export const systemMetrics = sqliteTable(
	'system_metrics',
	{
		cpuUsage: real('cpu_usage'),
		diskUsage: real('disk_usage'),
		eventLoopLatency: real('event_loop_latency'),
		heapTotal: integer('heap_total'),
		heapUsed: integer('heap_used'),
		id: integer('id').primaryKey(),
		memoryUsage: real('memory_usage'),
		// JSON for web-vital rows (rating/url/navigationType); null for system snapshots.
		metadata: text('metadata'),
		metricType: text('metric_type').notNull(),
		rss: integer('rss'),
		timestamp: integer('timestamp')
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		value: real('value'),
	},
	(table) => [
		index('idx_system_metrics_type_ts').on(table.metricType, table.timestamp),
		check(
			'ck_system_metrics_metric_type',
			sql`${table.metricType} = 'system' OR ${table.metricType} IN ('web-vital-cls','web-vital-fcp','web-vital-inp','web-vital-lcp','web-vital-ttfb')`,
		),
		check(
			'ck_system_metrics_metadata_json',
			sql`${table.metadata} IS NULL OR json_valid(${table.metadata})`,
		),
	],
);
