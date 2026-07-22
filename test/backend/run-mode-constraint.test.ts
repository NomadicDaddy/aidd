import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';

import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';

describe('run mode constraint', () => {
	test('baseline rejects retired role runs and accepts current modes', () => {
		const sqlite = new Database(':memory:');
		try {
			migrateWebDatabase(sqlite);

			expect(() =>
				sqlite.run(
					`INSERT INTO runs (
						id, project_path, project_name, backend, mode, status, started_at
					) VALUES ('run-role', 'D:/applications/demo', 'demo', 'native', 'role',
						'running', 100)`
				)
			).toThrow();
			sqlite.run(
				`INSERT INTO runs (
					id, project_path, project_name, backend, mode, status, started_at
				) VALUES ('run-coding', 'D:/applications/demo', 'demo', 'native', 'coding',
					'running', 200)`
			);
			expect(
				sqlite
					.query<{ mode: string }, []>("SELECT mode FROM runs WHERE id = 'run-coding'")
					.get()
			).toEqual({ mode: 'coding' });
		} finally {
			sqlite.close();
		}
	});
});
