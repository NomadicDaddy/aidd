import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';

import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';

function freshDatabase(): Database {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	return sqlite;
}

function insertEntry(sqlite: Database, id: string, projectPath: string, entryDate: string): void {
	sqlite.run(
		`INSERT INTO diary_entries
			(id, project_path, project_name, entry_date, title, summary, phase, generated_by, body_md, content_hash, file_mtime_ms, file_path, indexed_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			projectPath,
			'demo',
			entryDate,
			'Title',
			null,
			null,
			null,
			'# body',
			'hash',
			1,
			'p',
			1,
		],
	);
}

describe('diary_entries baseline schema', () => {
	test('creates the diary_entries table on a fresh database', () => {
		const sqlite = freshDatabase();
		try {
			const row = sqlite
				.query("SELECT name FROM sqlite_master WHERE type='table' AND name='diary_entries'")
				.get();
			expect(row).toEqual({ name: 'diary_entries' });
		} finally {
			sqlite.close();
		}
	});

	test('enforces a unique (project_path, entry_date) index', () => {
		const sqlite = freshDatabase();
		try {
			insertEntry(sqlite, 'a|p', 'd:/applications/demo', '2026-06-12');
			expect(() =>
				insertEntry(sqlite, 'b|p', 'd:/applications/demo', '2026-06-12'),
			).toThrow();
		} finally {
			sqlite.close();
		}
	});

	test('allows the same date across different projects', () => {
		const sqlite = freshDatabase();
		try {
			insertEntry(sqlite, 'a', 'd:/applications/one', '2026-06-12');
			expect(() =>
				insertEntry(sqlite, 'b', 'd:/applications/two', '2026-06-12'),
			).not.toThrow();
		} finally {
			sqlite.close();
		}
	});
});
