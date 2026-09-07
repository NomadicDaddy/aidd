import type { Database } from 'bun:sqlite';

import type { ColumnRow, ForeignKeyRow, IndexInfoRow, TableSqlRow } from './types.ts';

import { getSqliteCheckConstraints } from './constraints.ts';

export function checkColumnParity(
	sqlite: Database,
	tableName: string,
	drizzleColumnNames: Set<string>,
): string[] {
	const mismatches: string[] = [];
	const pragmaColumns = sqlite.query<ColumnRow, []>(`PRAGMA table_info(${tableName})`).all();
	const sqliteColumnNames = new Set(pragmaColumns.map((col) => col.name));

	for (const colName of drizzleColumnNames) {
		if (!sqliteColumnNames.has(colName)) {
			mismatches.push(
				`  MISSING COLUMN: ${tableName}.${colName} (in Drizzle, not in SQLite)`,
			);
		}
	}

	for (const colName of sqliteColumnNames) {
		if (!drizzleColumnNames.has(colName)) {
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
