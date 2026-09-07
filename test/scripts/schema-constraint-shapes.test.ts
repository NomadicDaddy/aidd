import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { foreignKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { checkConstraintShapes } from '../../scripts/lib/web-schema-parity/shapes.ts';

const parents = sqliteTable('parents', { id: text('id').primaryKey() });
const children = sqliteTable(
	'children',
	{ parent: text('parent'), state: text('state') },
	(table) => [
		foreignKey({ columns: [table.parent], foreignColumns: [parents.id] }).onDelete('cascade'),
		uniqueIndex('child_idx')
			.on(table.parent, table.state)
			.where(sql`${table.state} = 'Active'`),
	],
);

function inspect(
	indexSql: string,
	foreignKeySql = 'REFERENCES parents(id) ON DELETE CASCADE',
): string[] {
	const database = new Database(':memory:');
	try {
		database.exec(`CREATE TABLE parents(id TEXT PRIMARY KEY);
			CREATE TABLE children(parent TEXT ${foreignKeySql}, state TEXT);
			${indexSql}`);
		return checkConstraintShapes(database, children);
	} finally {
		database.close();
	}
}

const matchingIndex =
	"CREATE UNIQUE INDEX child_idx ON children(parent, state) WHERE state = 'Active'";

test('matching foreign-key behavior and partial unique index pass', () => {
	expect(inspect(matchingIndex)).toEqual([]);
});

test('predicate normalization preserves decimal values', () => {
	const table = sqliteTable('measurements', { value: text('value') }, (columns) => [
		uniqueIndex('measurement_idx')
			.on(columns.value)
			.where(sql`${columns.value} > 0.5`),
	]);
	const database = new Database(':memory:');
	try {
		database.exec('CREATE TABLE measurements(value TEXT)');
		database.exec(
			'CREATE UNIQUE INDEX measurement_idx ON measurements(value) WHERE value > 1.5',
		);
		expect(checkConstraintShapes(database, table)).toEqual([
			expect.stringContaining('INDEX SHAPE DRIFT'),
		]);
	} finally {
		database.close();
	}
});

test.each([
	matchingIndex.replace('UNIQUE ', ''),
	matchingIndex.replace('(parent, state)', '(state, parent)'),
	matchingIndex.replace("'Active'", "'active'"),
	matchingIndex.replace('(parent, state)', '(parent DESC, state)'),
])('same-named index definition drift is detected: %s', (indexSql) => {
	expect(inspect(indexSql)).toEqual([expect.stringContaining('INDEX SHAPE DRIFT')]);
});

test.each([
	'REFERENCES parents(id) ON DELETE RESTRICT',
	'REFERENCES other(id) ON DELETE CASCADE',
	'REFERENCES parents(other) ON DELETE CASCADE',
	'REFERENCES parents(id) ON DELETE CASCADE ON UPDATE CASCADE',
])('same-source-column foreign-key drift is detected: %s', (foreignKeySql) => {
	expect(inspect(matchingIndex, foreignKeySql)).toEqual([
		expect.stringContaining('FK SHAPE DRIFT'),
	]);
});
