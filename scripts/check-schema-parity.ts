/**
 * Schema parity checker: opens an in-memory SQLite database, runs the full
 * migration suite, then introspects every Drizzle-declared table and compares
 * PRAGMA table_info / index_list / foreign_key_list / CHECK constraints against
 * the Drizzle schema.
 *
 * Exits 0 on parity, 1 on any drift. Excludes schema_migrations from
 * product-table comparison. Type-safe: no `any`.
 *
 * Enforces: DATA-006 -- run history is file-backed, which is only true if the database the
 * migrations produce is the database the Drizzle schema declares.
 */

import { Database } from 'bun:sqlite';
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import { exit } from 'node:process';

import { migrateWebDatabase } from '../backend/src/db/migrate.ts';
import * as schema from '../backend/src/db/schema.ts';
import { getDrizzleCheckConstraints } from './lib/web-schema-parity/constraints.ts';
import {
	checkCheckConstraintParity,
	checkColumnParity,
	checkForeignKeyParity,
	checkIndexParity,
} from './lib/web-schema-parity/parity.ts';
import { checkConstraintShapes } from './lib/web-schema-parity/shapes.ts';

const IGNORED_TABLES = new Set(['schema_migrations']);

function getDrizzleTableEntries(): [string, SQLiteTable][] {
	const entries: [string, SQLiteTable][] = [];
	for (const [_key, val] of Object.entries(schema)) {
		try {
			const config = getTableConfig(val as SQLiteTable);
			if (!IGNORED_TABLES.has(config.name)) {
				entries.push([config.name, val as SQLiteTable]);
			}
		} catch {
			// Not a table; skip.
		}
	}
	return entries;
}

interface ParityScan {
	mismatches: string[];
	/** Drizzle-declared tables compared against SQLite. Rule 5's count for this gate. */
	tablesCompared: number;
}

function collectTableMismatches(sqlite: Database): ParityScan {
	const drizzleEntries = getDrizzleTableEntries();
	const allMismatches: string[] = [];
	const drizzleTableNames = new Set<string>();

	for (const [tableName, table] of drizzleEntries) {
		drizzleTableNames.add(tableName);

		const tableRows = sqlite
			.query<{ name: string }, [string]>(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
			)
			.all(tableName);
		if (tableRows.length === 0) {
			allMismatches.push(`MISSING TABLE: ${tableName} (declared in Drizzle, not in SQLite)`);
			continue;
		}

		const config = getTableConfig(table);
		const drizzleColumnNames = new Set(config.columns.map((col) => col.name));
		const drizzleIndexNames = new Set(config.indexes.map((idx) => idx.config.name));
		const fkFromColumns = new Set<string>();

		for (const fk of config.foreignKeys) {
			const ref = fk.reference();
			for (const col of ref.columns) {
				fkFromColumns.add(col.name);
			}
		}

		allMismatches.push(...checkColumnParity(sqlite, tableName, drizzleColumnNames));
		allMismatches.push(...checkIndexParity(sqlite, tableName, drizzleIndexNames));
		allMismatches.push(...checkForeignKeyParity(sqlite, tableName, fkFromColumns));
		allMismatches.push(...checkConstraintShapes(sqlite, table));
		allMismatches.push(
			...checkCheckConstraintParity(sqlite, tableName, getDrizzleCheckConstraints(table)),
		);
	}

	allMismatches.push(...collectExtraSqliteTableMismatches(sqlite, drizzleTableNames));
	return { mismatches: allMismatches, tablesCompared: drizzleEntries.length };
}

function collectExtraSqliteTableMismatches(
	sqlite: Database,
	drizzleTableNames: Set<string>,
): string[] {
	const sqliteTables = sqlite
		.query<{ name: string }, []>(
			"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
		)
		.all()
		.map((row) => row.name)
		.filter((name) => !IGNORED_TABLES.has(name));

	return sqliteTables
		.filter((tableName) => !drizzleTableNames.has(tableName))
		.map(
			(tableName) => `EXTRA TABLE: ${tableName} (in SQLite, not declared in Drizzle schema)`,
		);
}

/** Prints the drift, if any. Returns whether the schemas agree. */
function reportMismatches(allMismatches: string[]): boolean {
	if (allMismatches.length === 0) return true;
	console.error('[FAIL] Schema parity mismatches detected:\n');
	for (const mismatch of allMismatches) {
		console.error(mismatch);
	}
	console.error(`\nTotal mismatches: ${allMismatches.length}`);
	return false;
}

export function runSchemaParity(): number {
	const sqlite = new Database(':memory:');
	try {
		migrateWebDatabase(sqlite);
		const { mismatches, tablesCompared } = collectTableMismatches(sqlite);
		if (!reportMismatches(mismatches)) return 1;

		// Rule 5. `getDrizzleTableEntries` discovers its population by walking the schema barrel's
		// exports and swallowing every non-table in a bare `catch`, so a barrel that exported
		// nothing -- a bad re-export, a renamed file -- yields zero tables, zero mismatches, and a
		// pass identical to the one a matching schema earns.
		if (tablesCompared === 0) {
			console.error('[FAIL] Schema parity check compared no tables.');
			console.error(
				'backend/src/db/schema.ts exported no Drizzle tables. Parity cannot be asserted ' +
					'against a schema that was never read.',
			);
			return 1;
		}

		console.log(
			`[OK] Schema parity check passed (${tablesCompared} table(s) compared; ` +
				'Drizzle schema matches migrated SQLite).',
		);
		return 0;
	} finally {
		sqlite.close();
	}
}

if (import.meta.main) exit(runSchemaParity());
