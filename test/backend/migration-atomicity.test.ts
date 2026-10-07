import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';

import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { migrations } from '../../backend/src/db/migrations/registry.ts';

function withMigration(sql: string, check: (sqlite: Database) => void): void {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	migrations.push({ sql, version: 'test_atomicity' });
	try {
		check(sqlite);
	} finally {
		migrations.pop();
		sqlite.close();
	}
}

describe('migration statement execution', () => {
	test('rolls back the entire migration and its ledger on a runtime constraint failure', () => {
		withMigration(
			'INSERT INTO atomicity VALUES (2); CREATE UNIQUE INDEX ux_atomicity ON atomicity(v); INSERT INTO atomicity VALUES (3);',
			(sqlite) => {
				sqlite.exec(
					'CREATE TABLE atomicity(v INTEGER); INSERT INTO atomicity VALUES (1),(1);',
				);
				expect(() => migrateWebDatabase(sqlite)).toThrow('UNIQUE constraint failed');
				expect(sqlite.query('SELECT v FROM atomicity').all()).toEqual([{ v: 1 }, { v: 1 }]);
				expect(
					sqlite
						.query(
							"SELECT version FROM schema_migrations WHERE version = 'test_atomicity'",
						)
						.all(),
				).toEqual([]);
			},
		);
	});

	// audit-database-1790858369: foreign keys are off during migrations, so an orphan row used to
	// be committed and recorded, and every later start failed without naming the migration.
	test('rejects a migration that leaves an orphan row, naming it, before the ledger row exists', () => {
		withMigration(
			'CREATE TABLE fk_parent(id INTEGER PRIMARY KEY); CREATE TABLE fk_child(id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES fk_parent(id)); INSERT INTO fk_child VALUES (1, 99);',
			(sqlite) => {
				expect(() => migrateWebDatabase(sqlite)).toThrow(
					/Migration test_atomicity left 1 foreign key violation/,
				);
				expect(
					sqlite.query("SELECT name FROM sqlite_master WHERE name = 'fk_child'").all(),
				).toEqual([]);
				expect(
					sqlite
						.query(
							"SELECT version FROM schema_migrations WHERE version = 'test_atomicity'",
						)
						.all(),
				).toEqual([]);
			},
		);
	});

	test('uses SQLite parsing for comments, quoted semicolons and trigger bodies', () => {
		withMigration(
			`-- leading comment;
CREATE TABLE "atomicity;table" (v TEXT);
/* between; statements */ CREATE TABLE atomicity_events (v TEXT);
CREATE TRIGGER atomicity_trigger AFTER INSERT ON "atomicity;table" BEGIN
 INSERT INTO atomicity_events VALUES ('first;value');
 INSERT INTO atomicity_events VALUES (new.v);
END;
INSERT INTO "atomicity;table" VALUES ('it''s;literal');
-- trailing comment;
/* trailing block; */`,
			(sqlite) => {
				migrateWebDatabase(sqlite);
				expect(sqlite.query('SELECT v FROM atomicity_events').all()).toEqual([
					{ v: 'first;value' },
					{ v: "it's;literal" },
				]);
				migrateWebDatabase(sqlite);
				expect(
					sqlite.query('SELECT count(*) AS count FROM atomicity_events').get(),
				).toEqual({ count: 2 });
			},
		);
	});

	test('rejects unbound parameters before recording a migration', () => {
		withMigration(
			'CREATE TABLE atomicity(v TEXT); INSERT INTO atomicity VALUES (?);',
			(sqlite) => {
				expect(() => migrateWebDatabase(sqlite)).toThrow('literal SQL without parameters');
				expect(
					sqlite.query("SELECT name FROM sqlite_master WHERE name = 'atomicity'").all(),
				).toEqual([]);
			},
		);
	});
});
