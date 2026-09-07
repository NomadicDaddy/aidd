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
	commands: ReturnType<typeof makeDb>['commands'],
	id: string,
	overrides: Record<string, unknown> = {},
) {
	const result = await commands.insertRunIfUnderCeiling({
		maxConcurrentRuns: 10,
		maxConcurrentRunsPerProject: 10,
		values: reservationValues(id, overrides),
	});
	expect(result.kind).toBe('inserted');
}

describe('setRunPid', () => {
	test('stamps the spawned pid onto a run reserved before the spawn', async () => {
		const { commands, db } = makeDb();
		await insertReservation(commands, 'r1');

		expect(await commands.setRunPid({ pid: 4242, runId: 'r1' })).toBe(1);

		const [row] = await db.select().from(runs).where(eq(runs.id, 'r1'));
		expect(row?.pid).toBe(4242);
	});

	test('refuses to stamp a pid onto a run that already went terminal', async () => {
		const { commands, db } = makeDb();
		await insertReservation(commands, 'r1', { status: 'failed' });

		expect(await commands.setRunPid({ pid: 4242, runId: 'r1' })).toBe(0);

		const [row] = await db.select().from(runs).where(eq(runs.id, 'r1'));
		expect(row?.pid).toBeNull();
	});
});

describe('releaseRunReservation', () => {
	test('removes a reservation whose child never started and frees the ceiling slot', async () => {
		const { commands, db } = makeDb();
		await insertReservation(commands, 'r1');

		expect(await commands.releaseRunReservation({ runId: 'r1' })).toBe(1);
		expect(await db.select().from(runs)).toHaveLength(0);

		// The slot is genuinely free again: a ceiling of one admits the next launch.
		const next = await commands.insertRunIfUnderCeiling({
			maxConcurrentRuns: 1,
			maxConcurrentRunsPerProject: 1,
			values: reservationValues('r2'),
		});
		expect(next.kind).toBe('inserted');
	});

	test('leaves a run alone once its child has a pid', async () => {
		const { commands, db } = makeDb();
		await insertReservation(commands, 'r1', { pid: 4242 });

		expect(await commands.releaseRunReservation({ runId: 'r1' })).toBe(0);
		expect(await db.select().from(runs)).toHaveLength(1);
	});

	test('leaves a run alone once it has heartbeated', async () => {
		const { commands, db } = makeDb();
		await insertReservation(commands, 'r1', { heartbeatAt: Date.now() });

		expect(await commands.releaseRunReservation({ runId: 'r1' })).toBe(0);
		expect(await db.select().from(runs)).toHaveLength(1);
	});

	test('leaves a terminal run alone', async () => {
		const { commands, db } = makeDb();
		await insertReservation(commands, 'r1', { status: 'completed' });

		expect(await commands.releaseRunReservation({ runId: 'r1' })).toBe(0);
		expect(await db.select().from(runs)).toHaveLength(1);
	});

	test('is a no-op for a run id that was never reserved', async () => {
		const { commands } = makeDb();
		expect(await commands.releaseRunReservation({ runId: 'missing' })).toBe(0);
	});
});
