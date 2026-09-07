import type { Database } from 'bun:sqlite';

import { getTableName, SQL } from 'drizzle-orm';
import { getTableConfig, SQLiteSyncDialect, type SQLiteTable } from 'drizzle-orm/sqlite-core';

interface ForeignKeyRow {
	from: string;
	id: number;
	on_delete: string;
	on_update: string;
	seq: number;
	table: string;
	to: string;
}

/** Normalize SQL syntax without changing the contents or case of string literals. */
function normalizeSql(value: string, tableName: string): string {
	return value
		.split(/('(?:''|[^'])*')/)
		.map((part, index) => {
			if (index % 2 === 1) return part;
			return part
				.replace(/"([^"]+)"/g, '$1')
				.replaceAll(`${tableName}.`, '')
				.toLowerCase()
				.replace(/\s+/g, ' ')
				.replace(/\s*([(),])\s*/g, '$1');
		})
		.join('')
		.trim()
		.replace(/;$/, '');
}

/** Compare constraint behavior, in addition to the existing name-presence checks. */
export function checkConstraintShapes(sqlite: Database, table: SQLiteTable): string[] {
	const config = getTableConfig(table);
	const mismatches: string[] = [];
	const dialect = new SQLiteSyncDialect();
	for (const index of config.indexes) {
		const definition = index.config;
		const actual = sqlite
			.query<{ sql: string }, [string]>(
				"SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
			)
			.get(definition.name);
		if (!actual) continue; // The name-presence check reports missing indexes.
		const columns = definition.columns.map((column) =>
			column instanceof SQL ? dialect.sqlToQuery(column).sql : column.name,
		);
		const predicate = definition.where
			? ` WHERE ${dialect.sqlToQuery(definition.where).sql}`
			: '';
		const expected = `(${columns.join(',')})${predicate}`;
		const actualBody = actual.sql.slice(actual.sql.indexOf('('));
		const unique = /^CREATE\s+UNIQUE\s+INDEX\b/i.test(actual.sql);
		if (
			unique !== definition.unique ||
			normalizeSql(actualBody, config.name) !== normalizeSql(expected, config.name)
		) {
			mismatches.push(`  INDEX SHAPE DRIFT: ${config.name}.${definition.name}`);
		}
	}
	const rows = sqlite
		.query<ForeignKeyRow, []>(`PRAGMA foreign_key_list("${config.name.replaceAll('"', '""')}")`)
		.all();
	const actualKeys = new Map<number, ForeignKeyRow[]>();
	for (const row of rows) {
		const group = actualKeys.get(row.id) ?? [];
		group.push(row);
		actualKeys.set(row.id, group);
	}
	const actual = [...actualKeys.values()]
		.map((group) => {
			group.sort((left, right) => left.seq - right.seq);
			const first = group[0];
			return JSON.stringify([
				group.map((row) => row.from),
				first?.table,
				group.map((row) => row.to),
				first?.on_delete.toLowerCase(),
				first?.on_update.toLowerCase(),
			]);
		})
		.sort();
	const expected = config.foreignKeys
		.map((key) => {
			const reference = key.reference();
			return JSON.stringify([
				reference.columns.map((column) => column.name),
				getTableName(reference.foreignTable),
				reference.foreignColumns.map((column) => column.name),
				key.onDelete ?? 'no action',
				key.onUpdate ?? 'no action',
			]);
		})
		.sort();
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		mismatches.push(`  FK SHAPE DRIFT: ${config.name} (columns, target or actions differ)`);
	}
	return mismatches;
}
