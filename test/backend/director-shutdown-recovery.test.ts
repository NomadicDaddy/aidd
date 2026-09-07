import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { CycleExecutorDeps } from '../../backend/src/services/director/cycleExecutor.ts';
import type { FleetSummary } from '../../backend/src/services/director/types.ts';
import type { WebSocketHub } from '../../backend/src/webSocketHub.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { directorCycles } from '../../backend/src/db/schema.ts';
import { awaitAndPersistCycle } from '../../backend/src/services/director/cycleExecutor.ts';
import { failCycle } from '../../backend/src/services/director/cycleFailure.ts';

test('a disposed Director await preserves its running cycle and can resume persistence', async () => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const { db } = wrapWebDatabase(sqlite);
	let disposed = false;
	let resume = false;
	let persisted = 0;
	const deps = {
		autoLaunchSuggestions: async () => {},
		deleteActiveStage: () => {},
		disposed: () => disposed,
		persistCycleResult: async () => {
			persisted++;
			await db
				.update(directorCycles)
				.set({ status: 'completed' })
				.where(eq(directorCycles.id, 'cycle'));
		},
		readCycleOutput: async () => ({ output: undefined, outputStatus: 'missing' }),
		runService: {
			getRun: async () => {
				if (!resume) disposed = true;
				return { status: resume ? 'completed' : 'running' };
			},
		},
		setCycleStage: () => {},
	} as unknown as CycleExecutorDeps;
	try {
		await db.insert(directorCycles).values({ id: 'cycle', startedAt: 1, status: 'running' });
		await expect(
			awaitAndPersistCycle(deps, 'cycle', 'run', 'output.json', {} as FleetSummary),
		).resolves.toBeUndefined();
		expect(persisted).toBe(0);
		expect((await db.select().from(directorCycles))[0]).toMatchObject({
			status: 'running',
			failureReason: null,
		});
		disposed = false;
		resume = true;
		await awaitAndPersistCycle(deps, 'cycle', 'run', 'output.json', {} as FleetSummary);
		expect(persisted).toBe(1);
		expect((await db.select().from(directorCycles))[0]?.status).toBe('completed');
	} finally {
		sqlite.close();
	}
});

test('a late Director failure cannot rewrite a completed cycle or broadcast a false failure', async () => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const { db } = wrapWebDatabase(sqlite);
	const broadcasts: unknown[] = [];
	const hub = {
		broadcast: (event: unknown) => broadcasts.push(event),
	} as unknown as WebSocketHub;
	try {
		await db
			.insert(directorCycles)
			.values({ id: 'cycle', startedAt: 1, status: 'completed', totalSuggestions: 7 });
		await failCycle(db, hub, 'cycle', new Error('late failure'));
		expect((await db.select().from(directorCycles))[0]).toMatchObject({
			status: 'completed',
			totalSuggestions: 7,
			failureReason: null,
		});
		expect(broadcasts).toEqual([]);
	} finally {
		sqlite.close();
	}
});
