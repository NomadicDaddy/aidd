import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';

import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';

function seededDatabase(): Database {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	return sqlite;
}

function insertRun(sqlite: Database, id: string, initiator: null | string): void {
	sqlite.run(
		`INSERT INTO runs (
			id, project_path, project_name, backend, mode, status, started_at, initiator
		) VALUES (?, 'D:/applications/demo', 'demo', 'native', 'coding', 'running', 100, ?)`,
		[id, initiator],
	);
}

describe('run initiator constraint', () => {
	test('accepts the two recorded values and NULL, rejects anything else', () => {
		const sqlite = seededDatabase();
		try {
			insertRun(sqlite, 'run-operator', 'operator');
			insertRun(sqlite, 'run-automatic', 'automatic');
			// NULL is a legal state, not a defect: it is what "nobody recorded this" looks like.
			insertRun(sqlite, 'run-unrecorded', null);

			expect(() => insertRun(sqlite, 'run-user', 'user')).toThrow();
			expect(() => insertRun(sqlite, 'run-empty', '')).toThrow();
			// 'scheduled' is a source, not an initiator. The two vocabularies answer different
			// questions and the constraint is what stops one leaking into the other's column.
			expect(() => insertRun(sqlite, 'run-scheduled', 'scheduled')).toThrow();

			expect(
				sqlite
					.query<{ id: string; initiator: null | string }, []>(
						'SELECT id, initiator FROM runs ORDER BY id',
					)
					.all(),
			).toEqual([
				{ id: 'run-automatic', initiator: 'automatic' },
				{ id: 'run-operator', initiator: 'operator' },
				{ id: 'run-unrecorded', initiator: null },
			]);
		} finally {
			sqlite.close();
		}
	});

	test('a run written without an initiator stays NULL — nothing back-fills it', () => {
		const sqlite = seededDatabase();
		try {
			// Exactly the shape of a row that carries no initiator. Guessing a value for it
			// would put an invented fact into run history, which is the thing this feature removes.
			sqlite.run(
				`INSERT INTO runs (
					id, project_path, project_name, backend, mode, status, started_at
				) VALUES ('run-no-initiator', 'D:/applications/demo', 'demo', 'native', 'coding',
					'running', 100)`,
			);
			expect(
				sqlite
					.query<{ initiator: null | string }, []>(
						"SELECT initiator FROM runs WHERE id = 'run-no-initiator'",
					)
					.get(),
			).toEqual({ initiator: null });
		} finally {
			sqlite.close();
		}
	});

	test('director cycles carry the same vocabulary under their own constraint', () => {
		const sqlite = seededDatabase();
		try {
			sqlite.run(
				`INSERT INTO director_cycles (id, started_at, status, initiator)
					VALUES ('cycle-operator', 100, 'running', 'operator')`,
			);
			sqlite.run(
				`INSERT INTO director_cycles (id, started_at, status, initiator)
					VALUES ('cycle-automatic', 200, 'running', 'automatic')`,
			);
			sqlite.run(
				`INSERT INTO director_cycles (id, started_at, status)
					VALUES ('cycle-no-initiator', 300, 'running')`,
			);

			expect(() =>
				sqlite.run(
					`INSERT INTO director_cycles (id, started_at, status, initiator)
						VALUES ('cycle-bad', 400, 'running', 'schedule')`,
				),
			).toThrow();

			expect(
				sqlite
					.query<{ initiator: null | string }, []>(
						"SELECT initiator FROM director_cycles WHERE id = 'cycle-no-initiator'",
					)
					.get(),
			).toEqual({ initiator: null });
		} finally {
			sqlite.close();
		}
	});
});

function insertSession(sqlite: Database, id: string, initiator: null | string): void {
	sqlite.run(
		`INSERT INTO pipeline_sessions (
			id, project_path, project_name, recipe_id, recipe_name, parameters_json,
			started_at, total_steps, initiator
		) VALUES (?, 'D:/applications/demo', 'demo', 'r1', 'demo-recipe', '{}', 100, 1, ?)`,
		[id, initiator],
	);
}

function sessionInitiator(sqlite: Database, id: string): null | string {
	return (
		sqlite
			.query<{ initiator: null | string }, [string]>(
				'SELECT initiator FROM pipeline_sessions WHERE id = ?',
			)
			.get(id)?.initiator ?? null
	);
}

describe('a pipeline session records who started it', () => {
	test('both answers round-trip, and nothing else is accepted', () => {
		// The session is where a Run now's answer has to survive. `source` says 'scheduled' for the
		// timer firing and for a person pressing Run now alike, so a session that did not store the
		// answer could only guess it back — and on resume, guessing is all there would be.
		const sqlite = seededDatabase();
		try {
			insertSession(sqlite, 'sess-operator', 'operator');
			insertSession(sqlite, 'sess-automatic', 'automatic');
			expect(sessionInitiator(sqlite, 'sess-operator')).toBe('operator');
			expect(sessionInitiator(sqlite, 'sess-automatic')).toBe('automatic');
			expect(() => insertSession(sqlite, 'sess-junk', 'user')).toThrow();
		} finally {
			sqlite.close();
		}
	});

	test('a session written without an initiator reads back as unrecorded', () => {
		// NULL is permitted and deliberately not back-filled. Nothing can tell which of
		// those sessions were a Run now, and inventing 'automatic' for all of them would put a
		// wrong answer where an absent one belongs.
		const sqlite = seededDatabase();
		try {
			insertSession(sqlite, 'sess-no-initiator', null);
			expect(sessionInitiator(sqlite, 'sess-no-initiator')).toBeNull();
		} finally {
			sqlite.close();
		}
	});
});
