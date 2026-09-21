import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { runs } from '../../backend/src/db/schema.ts';

function makeDb() {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	return wrapWebDatabase(sqlite);
}

function reservationValues(id: string, overrides: Record<string, unknown> = {}) {
	return {
		backend: 'native',
		heartbeatAt: null,
		id,
		mode: 'coding',
		pid: null,
		projectName: 'proj',
		projectPath: '/proj/a',
		source: 'web',
		startedAt: Date.now(),
		status: 'running',
		...overrides,
	};
}

async function insertReservation(
	harness: ReturnType<typeof makeDb>,
	id: string,
	overrides: Record<string, unknown> = {},
) {
	const result = await harness.commands.insertQueuedRun({
		values: reservationValues(id),
	});
	expect(result.kind).toBe('inserted');
	const status = overrides.status;
	if (status !== undefined && status !== 'queued' && status !== 'running') {
		await harness.db
			.update(runs)
			.set({ status: status as 'completed' | 'failed' })
			.where(eq(runs.id, id));
		return;
	}
	if (status !== 'queued' && overrides.pid === undefined && overrides.heartbeatAt === undefined) {
		expect(
			(
				await harness.commands.promoteOldestQueuedRun({
					dataDir: '/data',
					maxConcurrentRuns: 10,
					maxConcurrentRunsPerProject: 10,
					useWorktrees: true,
				})
			).kind,
		).toBe('promoted');
	}
	if (overrides.pid !== undefined || overrides.heartbeatAt !== undefined) {
		await harness.db
			.update(runs)
			.set({
				...(overrides.heartbeatAt !== undefined
					? { heartbeatAt: overrides.heartbeatAt as number }
					: {}),
				...(overrides.pid !== undefined ? { pid: overrides.pid as number } : {}),
			})
			.where(eq(runs.id, id));
	}
}

describe('setRunPid', () => {
	test('stamps the spawned pid onto a run reserved before the spawn', async () => {
		const harness = makeDb();
		const { commands, db } = harness;
		await insertReservation(harness, 'r1');

		expect(await commands.setRunPid({ pid: 4242, runId: 'r1' })).toBe(1);

		const [row] = await db.select().from(runs).where(eq(runs.id, 'r1'));
		expect(row?.pid).toBe(4242);
	});

	test('refuses to stamp a pid onto a run that already went terminal', async () => {
		const harness = makeDb();
		const { commands, db } = harness;
		await insertReservation(harness, 'r1', { status: 'failed' });

		expect(await commands.setRunPid({ pid: 4242, runId: 'r1' })).toBe(0);

		const [row] = await db.select().from(runs).where(eq(runs.id, 'r1'));
		expect(row?.pid).toBeNull();
	});
});

describe('releaseRunReservation', () => {
	test('removes a reservation whose child never started and frees the ceiling slot', async () => {
		const harness = makeDb();
		const { commands, db } = harness;
		await insertReservation(harness, 'r1');

		expect(await commands.releaseRunReservation({ runId: 'r1' })).toBe(1);
		expect(await db.select().from(runs)).toHaveLength(0);

		// The slot is genuinely free again: a ceiling of one admits the next launch.
		await commands.insertQueuedRun({ values: reservationValues('r2') });
		const next = await commands.promoteOldestQueuedRun({
			dataDir: '/data',
			maxConcurrentRuns: 1,
			maxConcurrentRunsPerProject: 1,
			useWorktrees: true,
		});
		expect(next.kind).toBe('promoted');
	});

	test('leaves a run alone once its child has a pid', async () => {
		const harness = makeDb();
		const { commands, db } = harness;
		await insertReservation(harness, 'r1', { pid: 4242 });

		expect(await commands.releaseRunReservation({ runId: 'r1' })).toBe(0);
		expect(await db.select().from(runs)).toHaveLength(1);
	});

	test('leaves a run alone once it has heartbeated', async () => {
		const harness = makeDb();
		const { commands, db } = harness;
		await insertReservation(harness, 'r1', { heartbeatAt: Date.now() });

		expect(await commands.releaseRunReservation({ runId: 'r1' })).toBe(0);
		expect(await db.select().from(runs)).toHaveLength(1);
	});

	test('leaves a terminal run alone', async () => {
		const harness = makeDb();
		const { commands, db } = harness;
		await insertReservation(harness, 'r1', { status: 'completed' });

		expect(await commands.releaseRunReservation({ runId: 'r1' })).toBe(0);
		expect(await db.select().from(runs)).toHaveLength(1);
	});

	test('is a no-op for a run id that was never reserved', async () => {
		const { commands } = makeDb();
		expect(await commands.releaseRunReservation({ runId: 'missing' })).toBe(0);
	});
});
