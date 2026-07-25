import type { Database } from 'bun:sqlite';

import { assertNoForeignKeyViolations } from './integrity.ts';
import { migrations } from './migrations/registry.ts';

function tableExists(sqlite: Database, tableName: string): boolean {
	const rows = sqlite
		.query<{ name: string }, [string]>(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
		)
		.all(tableName);
	return rows.length > 0;
}

function getAppliedVersions(sqlite: Database): Set<string> {
	if (!tableExists(sqlite, 'schema_migrations')) {
		return new Set();
	}
	const rows = sqlite
		.query<{ version: string }, []>('SELECT version FROM schema_migrations')
		.all();
	return new Set(rows.map((row) => row.version));
}

function recordVersion(sqlite: Database, version: string): void {
	sqlite.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
		version,
		Date.now(),
	]);
}

export function migrateWebDatabase(sqlite: Database): void {
	// Ensure the migrations ledger table exists.
	sqlite.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
	version TEXT PRIMARY KEY,
	applied_at INTEGER NOT NULL
);
`);

	const applied = getAppliedVersions(sqlite);

	// Disable foreign key enforcement around migrations so table-rebuild
	// migrations can DROP and recreate parent tables without triggering
	// ON DELETE cascades on children. PRAGMA foreign_keys cannot be toggled
	// inside a transaction, so we set it before BEGIN and restore afterwards.
	const fkRow = sqlite.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get();
	const wasFkEnabled = (fkRow?.foreign_keys ?? 0) === 1;
	if (wasFkEnabled) {
		sqlite.exec('PRAGMA foreign_keys = OFF;');
	}

	try {
		// Apply pending migrations.
		for (const migration of migrations) {
			if (applied.has(migration.version)) {
				continue;
			}

			sqlite.exec('BEGIN');
			try {
				sqlite.exec(migration.sql);
				recordVersion(sqlite, migration.version);
				sqlite.exec('COMMIT');
			} catch (err) {
				sqlite.exec('ROLLBACK');
				throw err;
			}
		}
	} finally {
		if (wasFkEnabled) {
			sqlite.exec('PRAGMA foreign_keys = ON;');
		}
	}

	assertNoForeignKeyViolations(sqlite);
}
