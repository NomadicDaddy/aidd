import type { Database } from 'bun:sqlite';

import type {
	ColumnRow,
	DrizzleColumnShape,
	ForeignKeyRow,
	IndexInfoRow,
	TableSqlRow,
} from './types.ts';

import { getSqliteCheckConstraints } from './constraints.ts';

/**
 * TEXT primary keys the baseline created without NOT NULL while Drizzle declares them notNull.
 *
 * Every row in these tables is written through Drizzle, which supplies the id, so no code path
 * can leave one empty; rebuilding fifteen tables to add a constraint nothing can violate is not
 * worth the migration. The list is explicit so that a sixteenth is reported: a new table declares
 * its TEXT primary key NOT NULL rather than joining it.
 */
export const NULLABLE_TEXT_PRIMARY_KEYS: ReadonlySet<string> = new Set([
	'app_launches.project_path',
	'diary_entries.id',
	'director_chat_messages.id',
	'director_chat_sessions.id',
	'director_cycles.id',
	'director_profiles.id',
	'invocation_events.id',
	'pipeline_sessions.id',
	'pipeline_step_results.id',
	'project_init_failures.id',
	'runs.id',
	'scheduled_task_executions.id',
	'scheduled_tasks.id',
	'settings.key',
	'suggestions.id',
]);

/**
 * Names first, then the shape of every column both sides have: NOT NULL, declared type and
 * whether a default is declared. Comparing names alone let a nullable-versus-notNull mismatch
 * pass for fifteen primary keys. An INTEGER PRIMARY KEY is the rowid and never stores NULL,
 * whatever table_info reports, so it is exempt from the nullability comparison.
 */
export function checkColumnParity(
	sqlite: Database,
	tableName: string,
	drizzleColumns: DrizzleColumnShape[],
): string[] {
	const mismatches: string[] = [];
	const pragmaColumns = sqlite.query<ColumnRow, []>(`PRAGMA table_info(${tableName})`).all();
	const sqliteByName = new Map(pragmaColumns.map((col) => [col.name, col]));
	const drizzleByName = new Map(drizzleColumns.map((col) => [col.name, col]));
	// Only a single-column INTEGER PRIMARY KEY is the rowid; an INTEGER column inside a composite
	// key is an ordinary column that SQLite will happily store NULL in.
	const primaryKeyColumns = pragmaColumns.filter((col) => col.pk > 0).length;

	for (const [colName, drizzle] of drizzleByName) {
		const row = sqliteByName.get(colName);
		if (row === undefined) {
			mismatches.push(
				`  MISSING COLUMN: ${tableName}.${colName} (in Drizzle, not in SQLite)`,
			);
			continue;
		}
		const qualified = `${tableName}.${colName}`;
		const sqliteType = row.type.toUpperCase();
		const rowidAlias = primaryKeyColumns === 1 && row.pk === 1 && sqliteType === 'INTEGER';
		const sqliteNotNull = row.notnull !== 0;
		// The allowlist covers one exact shape, a nullable TEXT primary key that Drizzle declares
		// notNull, and nothing else that happens to share the name: a column that stops being the
		// primary key, changes type or gains a different mismatch is reported like any other.
		const acceptedLegacyShape =
			NULLABLE_TEXT_PRIMARY_KEYS.has(qualified) &&
			row.pk > 0 &&
			sqliteType === 'TEXT' &&
			!sqliteNotNull &&
			drizzle.notNull;
		if (!rowidAlias && sqliteNotNull !== drizzle.notNull && !acceptedLegacyShape) {
			mismatches.push(
				`  NULLABILITY: ${qualified} (SQLite ${sqliteNotNull ? 'NOT NULL' : 'nullable'}, Drizzle ${drizzle.notNull ? 'notNull' : 'nullable'})`,
			);
		}
		if (sqliteType !== drizzle.sqlType.toUpperCase()) {
			mismatches.push(
				`  TYPE: ${qualified} (SQLite ${row.type || '<none>'}, Drizzle ${drizzle.sqlType})`,
			);
		}
		const sqliteHasDefault = row.dflt_value !== null;
		if (sqliteHasDefault !== drizzle.hasDefault) {
			mismatches.push(
				`  DEFAULT: ${qualified} (SQLite ${sqliteHasDefault ? `default ${row.dflt_value}` : 'no default'}, Drizzle ${drizzle.hasDefault ? 'default declared' : 'no default'})`,
			);
		}
	}

	for (const colName of sqliteByName.keys()) {
		if (!drizzleByName.has(colName)) {
			mismatches.push(`  EXTRA COLUMN: ${tableName}.${colName} (in SQLite, not in Drizzle)`);
		}
	}

	return mismatches;
}

export function checkIndexParity(
	sqlite: Database,
	tableName: string,
	drizzleIndexNames: Set<string>,
): string[] {
	const mismatches: string[] = [];
	const indexRows = sqlite.query<IndexInfoRow, []>(`PRAGMA index_list(${tableName})`).all();
	const explicitIndexes = indexRows.filter((idx) => idx.origin === 'c');
	const sqliteIndexNames = new Set(explicitIndexes.map((idx) => idx.name));

	for (const idxName of drizzleIndexNames) {
		if (!sqliteIndexNames.has(idxName)) {
			mismatches.push(
				`  MISSING INDEX: ${idxName} on ${tableName} (in Drizzle, not in SQLite)`,
			);
		}
	}

	for (const idxName of sqliteIndexNames) {
		if (!drizzleIndexNames.has(idxName)) {
			mismatches.push(
				`  EXTRA INDEX: ${idxName} on ${tableName} (in SQLite, not in Drizzle)`,
			);
		}
	}

	return mismatches;
}

export function checkForeignKeyParity(
	sqlite: Database,
	tableName: string,
	expectedFkFromColumns: Set<string>,
): string[] {
	const mismatches: string[] = [];
	const fkRows = sqlite.query<ForeignKeyRow, []>(`PRAGMA foreign_key_list(${tableName})`).all();
	const actualFkFromColumns = new Set(fkRows.map((fk) => fk.from));

	for (const fromCol of expectedFkFromColumns) {
		if (!actualFkFromColumns.has(fromCol)) {
			mismatches.push(
				`  MISSING FK: ${tableName}.${fromCol} (declared in Drizzle, not in SQLite)`,
			);
		}
	}

	for (const fromCol of actualFkFromColumns) {
		if (!expectedFkFromColumns.has(fromCol)) {
			const matchingFk = fkRows.find((fk) => fk.from === fromCol);
			mismatches.push(
				`  EXTRA FK: ${tableName}.${fromCol} -> ${matchingFk?.table}.${matchingFk?.to} (in SQLite, not in Drizzle)`,
			);
		}
	}

	return mismatches;
}

export function checkCheckConstraintParity(
	sqlite: Database,
	tableName: string,
	drizzleChecks: Map<string, string>,
): string[] {
	const mismatches: string[] = [];
	const tableSqlRow = sqlite
		.query<TableSqlRow, [string]>(
			"SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = ?",
		)
		.get(tableName);
	if (!tableSqlRow?.sql) return mismatches;

	const sqliteChecks = getSqliteCheckConstraints(tableSqlRow.sql);
	for (const [checkName, drizzleBody] of drizzleChecks) {
		const sqliteBody = sqliteChecks.get(checkName);
		if (sqliteBody === undefined) {
			mismatches.push(
				`  MISSING CHECK: ${tableName}.${checkName} (declared in Drizzle, not in SQLite migration SQL)`,
			);
		} else if (sqliteBody !== drizzleBody) {
			mismatches.push(
				`  CHECK DRIFT: ${tableName}.${checkName}\n` +
					`    Drizzle:  ${drizzleBody}\n` +
					`    SQLite:   ${sqliteBody}`,
			);
		}
	}

	for (const checkName of sqliteChecks.keys()) {
		if (!drizzleChecks.has(checkName)) {
			mismatches.push(
				`  EXTRA CHECK: ${tableName}.${checkName} (in SQLite migration SQL, not declared in Drizzle schema)`,
			);
		}
	}

	return mismatches;
}
