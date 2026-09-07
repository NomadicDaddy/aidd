import type { Database } from 'bun:sqlite';

import { assertNoForeignKeyViolations } from './integrity.ts';
import { migrations } from './migrations/registry.ts';

const BASELINE_VERSION = migrations[0]?.version ?? '0001_baseline';

function tableExists(sqlite: Database, tableName: string): boolean {
	const rows = sqlite
		.query<{ name: string }, [string]>(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
		)
		.all(tableName);
	return rows.length > 0;
}

function hasProductTables(sqlite: Database): boolean {
	const rows = sqlite
		.query<{ name: string }, []>(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'schema_migrations' AND name NOT LIKE 'sqlite_%'",
		)
		.all();
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

function executeMigration(sqlite: Database, sql: string): void {
	let remaining = sql;
	while (true) {
		remaining = remaining.replace(/^(?:\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '');
		if (remaining.length === 0) return;
		const statement = sqlite.prepare(remaining);
		try {
			// SQLite parses the first complete statement, including quoted semicolons and triggers.
			// Migrations have no bound parameters, so expanded SQL must be an exact source prefix.
			const parsed = statement.toString();
			if (parsed.length === 0 || !remaining.startsWith(parsed)) {
				throw new Error('Migration statement must contain literal SQL without parameters');
			}
			statement.run();
			remaining = remaining.slice(parsed.length);
		} finally {
			statement.finalize();
		}
	}
}

export class DatabaseBaselineError extends Error {
	constructor(path: string) {
		super(
			`The web database at ${path} predates the ${BASELINE_VERSION} schema baseline and is not ` +
				'upgraded in place. Stop aidd, remove aidd-panel.db together with its -wal, -shm, and ' +
				'.lock sidecars from the data directory, then start aidd again to create a fresh database.',
		);
		this.name = 'DatabaseBaselineError';
	}
}

// The registry starts from one baseline that creates the whole schema. A database whose tables
// exist without the baseline recorded in its ledger was created by some other chain: running the
// baseline over it would fail on the first CREATE TABLE, and skipping it would silently leave
// whatever columns that chain lacked. Refuse with the documented reset instead of guessing.
function assertBaselineRecorded(sqlite: Database, applied: Set<string>): void {
	if (applied.has(BASELINE_VERSION) || !hasProductTables(sqlite)) return;
	throw new DatabaseBaselineError(sqlite.filename);
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
	assertBaselineRecorded(sqlite, applied);

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
				executeMigration(sqlite, migration.sql);
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
