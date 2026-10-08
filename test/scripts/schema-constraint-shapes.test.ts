import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { is, sql } from 'drizzle-orm';
import {
	foreignKey,
	getTableConfig,
	sqliteTable,
	SQLiteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import * as schema from '../../backend/src/db/schema.ts';
import {
	checkColumnParity,
	NULLABLE_TEXT_PRIMARY_KEYS,
} from '../../scripts/lib/web-schema-parity/parity.ts';
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

// audit-schema-constraints-1790879440: column parity compared names only, so a nullable column
// declared notNull in Drizzle, a type change or a dropped default all passed.
function columnShapes(ddl: string, shapes: Parameters<typeof checkColumnParity>[2]): string[] {
	const database = new Database(':memory:');
	try {
		database.exec(ddl);
		return checkColumnParity(database, 'things', shapes);
	} finally {
		database.close();
	}
}

const thingsNotNull = { hasDefault: false, name: 'id', notNull: true, sqlType: 'text' };

test('a nullability mismatch is reported, with the rowid alias and the legacy keys exempt', () => {
	expect(columnShapes('CREATE TABLE things(id TEXT PRIMARY KEY)', [thingsNotNull])).toEqual([
		'  NULLABILITY: things.id (SQLite nullable, Drizzle notNull)',
	]);
	expect(
		columnShapes('CREATE TABLE things(id TEXT PRIMARY KEY NOT NULL)', [thingsNotNull]),
	).toEqual([]);
	// INTEGER PRIMARY KEY is the rowid: never NULL, whatever table_info says.
	expect(
		columnShapes('CREATE TABLE things(id INTEGER PRIMARY KEY)', [
			{ ...thingsNotNull, sqlType: 'integer' },
		]),
	).toEqual([]);
	expect(NULLABLE_TEXT_PRIMARY_KEYS.has('runs.id')).toBe(true);
	expect(NULLABLE_TEXT_PRIMARY_KEYS.has('things.id')).toBe(false);
});

// Review of c00008fa: an INTEGER column inside a composite key is not the rowid, and a name on
// the legacy allowlist earns no exemption for a shape other than the one accepted.
test('the rowid exemption is a single INTEGER key, and the allowlist is one exact shape', () => {
	const database = new Database(':memory:');
	try {
		database.exec('CREATE TABLE things(id INTEGER, tenant TEXT, PRIMARY KEY(id, tenant))');
		expect(
			checkColumnParity(database, 'things', [
				{ ...thingsNotNull, sqlType: 'integer' },
				{ hasDefault: false, name: 'tenant', notNull: true, sqlType: 'text' },
			]),
		).toEqual([
			'  NULLABILITY: things.id (SQLite nullable, Drizzle notNull)',
			'  NULLABILITY: things.tenant (SQLite nullable, Drizzle notNull)',
		]);
		// `runs.id` is on the allowlist as a nullable TEXT PRIMARY KEY. The same name as a plain
		// nullable column, or as a NOT NULL column that Drizzle declares nullable, is reported.
		database.exec('CREATE TABLE runs(id TEXT, other TEXT)');
		expect(checkColumnParity(database, 'runs', [thingsNotNull])).toEqual([
			'  NULLABILITY: runs.id (SQLite nullable, Drizzle notNull)',
			'  EXTRA COLUMN: runs.other (in SQLite, not in Drizzle)',
		]);
		database.exec('CREATE TABLE settings(key TEXT PRIMARY KEY NOT NULL)');
		expect(
			checkColumnParity(database, 'settings', [
				{ hasDefault: false, name: 'key', notNull: false, sqlType: 'text' },
			]),
		).toEqual(['  NULLABILITY: settings.key (SQLite NOT NULL, Drizzle nullable)']);
	} finally {
		database.close();
	}
});

test('a declared type or default-presence mismatch is reported', () => {
	expect(
		columnShapes('CREATE TABLE things(id TEXT NOT NULL, n INTEGER)', [
			thingsNotNull,
			{ hasDefault: false, name: 'n', notNull: false, sqlType: 'text' },
		]),
	).toEqual(['  TYPE: things.n (SQLite INTEGER, Drizzle text)']);
	expect(
		columnShapes("CREATE TABLE things(id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'new')", [
			thingsNotNull,
			{ hasDefault: false, name: 'state', notNull: true, sqlType: 'text' },
		]),
	).toEqual(["  DEFAULT: things.state (SQLite default 'new', Drizzle no default)"]);
	expect(
		columnShapes('CREATE TABLE things(id TEXT NOT NULL, state TEXT NOT NULL)', [
			thingsNotNull,
			{ hasDefault: true, name: 'state', notNull: true, sqlType: 'text' },
		]),
	).toEqual(['  DEFAULT: things.state (SQLite no default, Drizzle default declared)']);
});

test('the real migrated schema has no column-shape mismatch', () => {
	const database = new Database(':memory:');
	try {
		migrateWebDatabase(database);
		const mismatches: string[] = [];
		let tables = 0;
		for (const table of Object.values(schema)) {
			if (!is(table, SQLiteTable)) continue;
			const config = getTableConfig(table);
			tables += 1;
			mismatches.push(
				...checkColumnParity(
					database,
					config.name,
					config.columns.map((col) => ({
						hasDefault: col.default !== undefined,
						name: col.name,
						notNull: col.notNull,
						sqlType: col.getSQLType(),
					})),
				),
			);
		}
		expect(tables).toBeGreaterThan(10);
		expect(mismatches).toEqual([]);
	} finally {
		database.close();
	}
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
