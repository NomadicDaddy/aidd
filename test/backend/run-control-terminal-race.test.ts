import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { ControlContext } from '../../backend/src/services/run/control.ts';

import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import * as schema from '../../backend/src/db/schema.ts';
import { executeStatement } from '../../backend/src/db/statement.ts';
import { killRun, stopRun } from '../../backend/src/services/run/control.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

test.each(['kill', 'stop'])(
	'%s preserves a terminal write that wins during control I/O',
	async (action) => {
		const projectPath = await testTempDir('aidd-control-race-');
		const sqlite = new Database(':memory:');
		migrateWebDatabase(sqlite);
		let raced = false;
		const db = drizzle(
			async (sql, params, method) => {
				if (sql.startsWith('update "runs"') && !raced) {
					raced = true;
					// The heartbeat wins after the control read and immediately before its terminal write.
					sqlite.run(
						"UPDATE runs SET status='completed', exit_code=0, duration_ms=123, completed_at=456, stop_reason='completed' WHERE id='race'",
					);
				}
				return { rows: executeStatement(sqlite, sql, params, method).rows as unknown[] };
			},
			{ schema },
		);
		const broadcasts: unknown[] = [];
		let reconciliations = 0;
		const ctx = {
			db,
			heartbeatWatchers: new Map(),
			hub: { broadcast: (event: unknown) => broadcasts.push(event) },
			tailWatchers: new Map(),
			telemetry: {
				reconcileInvocationFromRun: async () => {
					reconciliations++;
				},
			},
		} as unknown as ControlContext;
		try {
			await db.insert(schema.runs).values({
				backend: 'codex',
				id: 'race',
				mode: 'coding',
				projectName: 'test',
				projectPath,
				source: 'web',
				startedAt: 1,
				status: 'running',
			});
			await (action === 'kill' ? killRun(ctx, 'race') : stopRun(ctx, 'race'));
			expect(raced).toBe(true);
			expect(
				sqlite
					.query(
						'SELECT status, exit_code, duration_ms, completed_at, stop_reason FROM runs WHERE id = ?',
					)
					.get('race'),
			).toEqual({
				completed_at: 456,
				duration_ms: 123,
				exit_code: 0,
				status: 'completed',
				stop_reason: 'completed',
			});
			expect(broadcasts).toEqual([]);
			expect(reconciliations).toBe(0);
		} finally {
			sqlite.close();
			await removeTempTree(projectPath);
		}
	},
);
