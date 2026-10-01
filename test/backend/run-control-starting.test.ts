import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { existsSync } from 'node:fs';

import type { ControlContext } from '../../backend/src/services/run/control.ts';

import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import * as schema from '../../backend/src/db/schema.ts';
import { executeStatement } from '../../backend/src/db/statement.ts';
import { killRun, stopRun } from '../../backend/src/services/run/control.ts';
import { runStopFilePath } from '../../shared/src/metadata/paths.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// A detached run has no pid on its row and no heartbeat file until its CLI has come up. Stop used
// to read that as a dead process: it marked the row stopped and deleted the stop file, and the
// child then started and ran with nothing left to stop it. Kill marked the row killed the same way.

async function controlFixture(startedAt: number): Promise<{
	cleanup: () => Promise<void>;
	ctx: ControlContext;
	projectPath: string;
	status: () => unknown;
}> {
	const projectPath = await testTempDir('aidd-control-starting-');
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const db = drizzle(
		async (sql, params, method) => ({
			rows: executeStatement(sqlite, sql, params, method).rows as unknown[],
		}),
		{ schema },
	);
	const ctx = {
		db,
		heartbeatWatchers: new Map(),
		hub: { broadcast: () => undefined },
		tailWatchers: new Map(),
		telemetry: { reconcileInvocationFromRun: async () => undefined },
	} as unknown as ControlContext;
	await db.insert(schema.runs).values({
		backend: 'codex',
		id: 'starting',
		mode: 'coding',
		projectName: 'test',
		projectPath,
		source: 'web',
		startedAt,
		status: 'running',
	});
	return {
		cleanup: async () => {
			sqlite.close();
			await removeTempTree(projectPath);
		},
		ctx,
		projectPath,
		status: () => sqlite.query('SELECT status FROM runs WHERE id = ?').get('starting'),
	};
}

test('stop on a run that is still starting leaves the row running and the stop file in place', async () => {
	const fixture = await controlFixture(Date.now());
	try {
		await stopRun(fixture.ctx, 'starting');

		expect(fixture.status()).toEqual({ status: 'running' });
		expect(existsSync(runStopFilePath(fixture.projectPath, 'starting'))).toBe(true);
	} finally {
		await fixture.cleanup();
	}
});

test('kill on a run that is still starting marks it killed and leaves a stop request for the child', async () => {
	const fixture = await controlFixture(Date.now());
	try {
		await killRun(fixture.ctx, 'starting');

		expect(fixture.status()).toEqual({ status: 'killed' });
		expect(existsSync(runStopFilePath(fixture.projectPath, 'starting'))).toBe(true);
	} finally {
		await fixture.cleanup();
	}
});

// Past the startup window a row with no pid and no heartbeat is a dead run, as before.
test.each(['kill', 'stop'] as const)(
	'%s on a pidless run past the startup window still ends the row and clears the stop file',
	async (action) => {
		const fixture = await controlFixture(1);
		try {
			await (action === 'kill'
				? killRun(fixture.ctx, 'starting')
				: stopRun(fixture.ctx, 'starting'));

			expect(fixture.status()).toEqual({ status: action === 'kill' ? 'killed' : 'stopped' });
			expect(existsSync(runStopFilePath(fixture.projectPath, 'starting'))).toBe(false);
		} finally {
			await fixture.cleanup();
		}
	},
);
