import { Database } from 'bun:sqlite';

import type { ControlContext } from '../../../backend/src/services/run/control.ts';

import { wrapWebDatabase } from '../../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../../backend/src/db/migrate.ts';
import * as schema from '../../../backend/src/db/schema.ts';
import { testTempDir } from '../../_helpers/temp.ts';
import { removeTempTree } from './remove-temp-tree.ts';

/** A web run row named `runId`, still `running`, in a fresh project, ready for Stop/Kill. */
export async function controlFixture(
	runId: string,
	startedAt: number,
): Promise<{
	cleanup: () => Promise<void>;
	ctx: ControlContext;
	projectPath: string;
	status: () => unknown;
}> {
	const projectPath = await testTempDir('aidd-control-');
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const { commands, db } = wrapWebDatabase(sqlite);
	const ctx = {
		commands,
		db,
		heartbeatWatchers: new Map(),
		hub: { broadcast: () => undefined },
		tailWatchers: new Map(),
		telemetry: { reconcileInvocationFromRun: async () => undefined },
	} as unknown as ControlContext;
	await db.insert(schema.runs).values({
		backend: 'codex',
		id: runId,
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
		status: () => sqlite.query('SELECT status FROM runs WHERE id = ?').get(runId),
	};
}
