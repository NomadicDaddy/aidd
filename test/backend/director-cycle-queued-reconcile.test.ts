import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { CycleExecutorDeps } from '../../backend/src/services/director/cycleExecutor.ts';
import type { ReconcileStaleCyclesContext } from '../../backend/src/services/director/cycleReconcile.ts';
import type { DirectorConfig } from '../../backend/src/services/director/types.ts';
import type { WebSocketHub } from '../../backend/src/webSocketHub.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { directorCycles, runs } from '../../backend/src/db/schema.ts';
import { reconcileStaleCycles } from '../../backend/src/services/director/cycleReconcile.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// A cycle's run waits in the queue when the concurrency ceiling is full. A restart in that state
// used to fail the cycle, because only a `running` run counted as in flight; the run was admitted
// afterwards and executed with no cycle waiting for its result.
test.each(['queued', 'running'])(
	'a cycle whose run is still %s at startup is re-attached, not failed',
	async (runStatus) => {
		const sqlite = new Database(':memory:');
		migrateWebDatabase(sqlite);
		const { db } = wrapWebDatabase(sqlite);
		const dataDir = await testTempDir('aidd-director-queued-');
		try {
			await db.insert(directorCycles).values({
				id: 'cycle_q',
				initiator: 'operator',
				startedAt: Date.now() - 1000,
				status: 'running',
			});
			await db.insert(runs).values({
				backend: 'native',
				directorCycleId: 'cycle_q',
				id: 'run_q',
				mode: 'director',
				projectName: 'sample',
				projectPath: '/fleet/sample',
				startedAt: Date.now() - 500,
				status: runStatus,
			});
			const cycleDir = join(dataDir, 'director');
			await mkdir(cycleDir, { recursive: true });
			await Bun.write(
				join(cycleDir, 'cycle_q-fleet-summary.json'),
				'{"fleetAggregations":{"fleetHealthScore":90}}\n',
			);

			const awaited: string[] = [];
			const ctx: ReconcileStaleCyclesContext = {
				activeStages: new Map(),
				awaitAndPersistCycle: async (cycleId, runId) => {
					awaited.push(`${cycleId}:${runId}`);
				},
				db,
				executorDeps: () =>
					({
						readCycleOutput: async () => {
							throw new Error('a waiting run has no output to read');
						},
					}) as unknown as CycleExecutorDeps,
				getConfig: () => ({ web: { dataDir } }) as unknown as DirectorConfig,
				hub: { broadcast: () => undefined } as unknown as WebSocketHub,
				setCycleStage: () => undefined,
			};

			await reconcileStaleCycles(ctx);

			expect(awaited).toEqual(['cycle_q:run_q']);
			const rows = await db
				.select()
				.from(directorCycles)
				.where(eq(directorCycles.id, 'cycle_q'));
			expect(rows[0]?.status).toBe('running');
		} finally {
			sqlite.close();
			await removeTempTree(dataDir);
		}
	},
);
