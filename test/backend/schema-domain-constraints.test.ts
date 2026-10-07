import { Database } from 'bun:sqlite';

import { expect, test } from 'bun:test';
import { getTableName } from 'drizzle-orm';

import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { migrations } from '../../backend/src/db/migrations/registry.ts';
import { directorCycles, runs } from '../../backend/src/db/schema.ts';

function insertTask(sqlite: Database): void {
	sqlite.run(
		"INSERT INTO scheduled_tasks (id,name,target_type,target_json,project_scope,schedule_kind,timezone,created_at,updated_at) VALUES ('task','Task','audit','{}','all','once','UTC',1,1)",
	);
}

function insertExecution(sqlite: Database, id: string, projectScope: string): void {
	sqlite.run(
		"INSERT INTO scheduled_task_executions (id,task_id,due_at,trigger,target_json,project_paths_json,project_scope,started_at) VALUES (?,'task',1,'manual','{}','[]',?,1)",
		[id, projectScope],
	);
}

function insertCycle(sqlite: Database, id: string, executionId: null | string = null): void {
	sqlite.run(
		"INSERT INTO director_cycles (id,status,scheduled_task_execution_id,started_at) VALUES (?,'running',?,1)",
		[id, executionId],
	);
}

function insertSuggestion(
	sqlite: Database,
	id: string,
	cycleId: string,
	dismissedBy: null | string,
) {
	sqlite.run(
		"INSERT INTO suggestions (id,cycle_id,task_type,risk_level,title,description,reasoning,status,dismissed_by,created_at) VALUES (?,?,'audit_remediation','LOW','Title','Description','Reasoning','dismissed',?,1)",
		[id, cycleId, dismissedBy],
	);
}

// audit-schema-constraints-1790879440: both single-active-row rules were held by command code
// alone; migration 0011 makes the database hold them too.
test('the database itself allows one running director cycle and one active execution per task', () => {
	const sqlite = new Database(':memory:');
	try {
		migrateWebDatabase(sqlite);
		insertTask(sqlite);
		sqlite.run(
			"INSERT INTO scheduled_tasks (id,name,target_type,target_json,project_scope,schedule_kind,timezone,created_at,updated_at) VALUES ('other','Other','audit','{}','all','once','UTC',1,1)",
		);
		insertCycle(sqlite, 'cycle-1');
		expect(() => insertCycle(sqlite, 'cycle-2')).toThrow(/UNIQUE constraint failed/);
		sqlite.run(
			"UPDATE director_cycles SET status = 'completed', completed_at = 2 WHERE id = 'cycle-1'",
		);
		insertCycle(sqlite, 'cycle-2');

		insertExecution(sqlite, 'exec-1', 'all');
		expect(() => insertExecution(sqlite, 'exec-2', 'all')).toThrow(/UNIQUE constraint failed/);
		sqlite.run("UPDATE scheduled_task_executions SET status = 'running' WHERE id = 'exec-1'");
		expect(() => insertExecution(sqlite, 'exec-2', 'all')).toThrow(/UNIQUE constraint failed/);
		// A skipped or completed second occurrence is history, not a second active row.
		for (const [id, status] of [
			['exec-skipped', 'skipped'],
			['exec-done', 'completed'],
		] as const) {
			sqlite.run(
				"INSERT INTO scheduled_task_executions (id,task_id,due_at,trigger,target_json,project_paths_json,project_scope,status,started_at,completed_at) VALUES (?,'task',1,'manual','{}','[]','all',?,1,1)",
				[id, status],
			);
		}
		// Another task holds its own active occurrence.
		sqlite.run(
			"INSERT INTO scheduled_task_executions (id,task_id,due_at,trigger,target_json,project_paths_json,project_scope,started_at) VALUES ('exec-other','other',1,'manual','{}','[]','all',1)",
		);
		expect(
			sqlite
				.query<{ n: number }, []>(
					"SELECT count(*) AS n FROM scheduled_task_executions WHERE status IN ('queued','running')",
				)
				.get()?.n,
		).toBe(2);
	} finally {
		sqlite.close();
	}
});

test('migration 0011 demotes duplicates already on disk and keeps the newest row active', () => {
	const sqlite = new Database(':memory:');
	try {
		// Apply the chain up to 0010, seed the duplicates the old code could have left, then 0011.
		const before = migrations.findIndex((m) => m.version === '0011_single_active_row_indexes');
		expect(before).toBeGreaterThan(0);
		const tail = migrations.splice(before);
		try {
			migrateWebDatabase(sqlite);
			insertTask(sqlite);
			sqlite.run(
				"INSERT INTO director_cycles (id,status,started_at) VALUES ('old','running',1),('new','running',2)",
			);
			sqlite.run(
				"INSERT INTO scheduled_task_executions (id,task_id,due_at,trigger,target_json,project_paths_json,project_scope,status,started_at) VALUES ('e-old','task',1,'manual','{}','[]','all','queued',1),('e-new','task',1,'manual','{}','[]','all','running',2)",
			);
		} finally {
			migrations.push(...tail);
		}
		migrateWebDatabase(sqlite);
		const cycles = sqlite
			.query<{ failure_reason: null | string; id: string; status: string }, []>(
				'SELECT id, status, failure_reason FROM director_cycles ORDER BY id',
			)
			.all();
		expect(cycles).toEqual([
			{ failure_reason: null, id: 'new', status: 'running' },
			{
				failure_reason:
					'Demoted by migration 0011_single_active_row_indexes: a later cycle was already running.',
				id: 'old',
				status: 'failed',
			},
		]);
		const executions = sqlite
			.query<{ completed_at: null | number; id: string; status: string }, []>(
				'SELECT id, status, completed_at FROM scheduled_task_executions ORDER BY id',
			)
			.all();
		expect(executions).toEqual([
			{ completed_at: null, id: 'e-new', status: 'running' },
			{ completed_at: 1, id: 'e-old', status: 'failed' },
		]);
		const indexes = sqlite
			.query<{ name: string }, []>(
				"SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'uq_%' ORDER BY name",
			)
			.all()
			.map((row) => row.name);
		expect(indexes).toContain('uq_director_cycles_running');
		expect(indexes).toContain('uq_scheduled_task_executions_active_task');
	} finally {
		sqlite.close();
	}
});

test('schema facade preserves director cycle and run table identities', () => {
	expect(getTableName(directorCycles)).toBe('director_cycles');
	expect(getTableName(runs)).toBe('runs');
});

test('the baseline schema carries the named domain indexes and foreign keys', () => {
	const sqlite = new Database(':memory:');
	try {
		migrateWebDatabase(sqlite);
		const indexes = sqlite
			.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'index'")
			.all()
			.map((row) => row.name);
		for (const name of [
			'idx_scheduled_task_executions_status',
			'idx_scheduled_task_executions_task_started',
			'idx_suggestions_cycle_id',
			'idx_suggestions_launched_pipeline_session_id',
			'idx_suggestions_launched_run_id',
			'idx_suggestions_project_id',
			'idx_suggestions_status',
		]) {
			expect(indexes).toContain(name);
		}

		expect(
			sqlite
				.query<{ from: string; on_delete: string; table: string }, []>(
					'PRAGMA foreign_key_list(scheduled_task_executions)',
				)
				.all()
				.map(({ from, on_delete, table }) => ({ from, on_delete, table })),
		).toEqual([{ from: 'task_id', on_delete: 'CASCADE', table: 'scheduled_tasks' }]);
		const suggestionForeignKeys = sqlite
			.query<{ from: string; on_delete: string; table: string }, []>(
				'PRAGMA foreign_key_list(suggestions)',
			)
			.all()
			.map(({ from, on_delete, table }) => ({ from, on_delete, table }));
		expect(suggestionForeignKeys).toEqual(
			expect.arrayContaining([
				{ from: 'cycle_id', on_delete: 'CASCADE', table: 'director_cycles' },
				{
					from: 'launched_pipeline_session_id',
					on_delete: 'SET NULL',
					table: 'pipeline_sessions',
				},
				{ from: 'launched_run_id', on_delete: 'SET NULL', table: 'runs' },
			]),
		);
		const runForeignKeys = sqlite
			.query<{ from: string; on_delete: string; table: string }, []>(
				'PRAGMA foreign_key_list(runs)',
			)
			.all()
			.map(({ from, on_delete, table }) => ({ from, on_delete, table }));
		expect(runForeignKeys).toContainEqual({
			from: 'director_cycle_id',
			on_delete: 'SET NULL',
			table: 'director_cycles',
		});
		expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
	} finally {
		sqlite.close();
	}
});

test('named domain checks accept every supported value and reject raw invalid writes', () => {
	const sqlite = new Database(':memory:');
	try {
		migrateWebDatabase(sqlite);
		sqlite.exec('PRAGMA foreign_keys = ON;');
		insertTask(sqlite);
		insertCycle(sqlite, 'cycle');

		for (const scope of ['all', 'explicit', 'none']) {
			expect(() => insertExecution(sqlite, `valid-${scope}`, scope)).not.toThrow();
			// One active occurrence per task since 0011: retire it before the next scope's row.
			sqlite.run(
				"UPDATE scheduled_task_executions SET status = 'completed', completed_at = 1 WHERE id = ?",
				[`valid-${scope}`],
			);
		}
		expect(() => insertExecution(sqlite, 'invalid-scope', 'everything')).toThrow(
			/ck_scheduled_task_executions_project_scope/,
		);

		for (const [suffix, dismissedBy] of [
			['historical', null],
			['user', 'user'],
			['retired', 'cycle_retire'],
		] as const) {
			expect(() =>
				insertSuggestion(sqlite, `valid-${suffix}`, 'cycle', dismissedBy),
			).not.toThrow();
		}
		expect(() => insertSuggestion(sqlite, 'invalid-dismissal', 'cycle', 'automatic')).toThrow(
			/ck_suggestions_dismissed_by/,
		);

		const executionSql = sqlite
			.query<{ sql: string }, [string]>(
				"SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
			)
			.get('scheduled_task_executions')?.sql;
		const suggestionSql = sqlite
			.query<{ sql: string }, [string]>(
				"SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
			)
			.get('suggestions')?.sql;
		expect(executionSql).toContain('ck_scheduled_task_executions_project_scope');
		expect(suggestionSql).toContain('ck_suggestions_dismissed_by');
		expect(
			sqlite.query<{ integrity_check: string }, []>('PRAGMA integrity_check').get(),
		).toEqual({
			integrity_check: 'ok',
		});
		expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
	} finally {
		sqlite.close();
	}
});
