import { Database } from 'bun:sqlite';

import { expect, test } from 'bun:test';
import { getTableName } from 'drizzle-orm';

import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
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
