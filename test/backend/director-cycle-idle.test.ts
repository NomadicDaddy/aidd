import { Database } from 'bun:sqlite';

import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { RunInitiator } from 'aidd-shared/metadata/active-runs';
import type { DbCommands } from '../../backend/src/db/commands.ts';
import type { WebDatabase } from '../../backend/src/db/client.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import {
	directorCycles,
	scheduledTaskExecutions,
	scheduledTasks,
} from '../../backend/src/db/schema.ts';

let commands: DbCommands;
let db: WebDatabase;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	({ commands, db } = wrapWebDatabase(sqlite));
});

function start(
	id: string,
	scheduledTaskExecutionId: null | string = null,
	initiator: null | RunInitiator = null,
) {
	return commands.startDirectorCycleIfIdle({
		values: { id, initiator, scheduledTaskExecutionId, startedAt: 1, status: 'running' },
	});
}

/** A claimed occurrence for the built-in Director task, so a cycle has something to hang off. */
async function seedOccurrence(): Promise<string> {
	await db.insert(scheduledTasks).values({
		createdAt: 1,
		id: 'director-task',
		name: 'Director fleet cycle',
		nextRunAt: 100,
		projectScope: 'none',
		scheduleExpression: '0 */12 * * *',
		scheduleKind: 'cron',
		state: 'active',
		systemKey: 'director',
		targetJson: '{"type":"director"}',
		targetType: 'director',
		timezone: 'UTC',
		updatedAt: 1,
	});
	await db.insert(scheduledTaskExecutions).values({
		dueAt: 100,
		id: 'execution-1',
		projectPathsJson: '[]',
		projectScope: 'none',
		startedAt: 101,
		status: 'running',
		targetJson: '{"type":"director"}',
		taskId: 'director-task',
		trigger: 'scheduled',
	});
	return 'execution-1';
}

describe('the Director idle gate', () => {
	test('lets exactly one of two concurrent starts through', async () => {
		// The race this closes is a scheduled occurrence and the Run Cycle button arriving together:
		// without the gate each reads "nothing running" and starts its own cycle over the same fleet.
		const results = await Promise.all([start('cycle-a'), start('cycle-b')]);
		expect(results.map((result) => result.kind).sort()).toEqual(['busy', 'started']);
		expect(await db.select().from(directorCycles)).toHaveLength(1);
	});

	test('names the cycle that is holding the fleet', async () => {
		expect(await start('cycle-a')).toEqual({ kind: 'started' });
		expect(await start('cycle-b')).toEqual({ kind: 'busy', runningCycleId: 'cycle-a' });
	});

	test('lets the next cycle start once the running one finishes', async () => {
		await start('cycle-a');
		await db
			.update(directorCycles)
			.set({ completedAt: 2, status: 'completed' })
			.where(eq(directorCycles.id, 'cycle-a'));
		expect(await start('cycle-b')).toEqual({ kind: 'started' });
		expect(await db.select().from(directorCycles)).toHaveLength(2);
	});

	test('a failed cycle does not hold the fleet either', async () => {
		await start('cycle-a');
		await db
			.update(directorCycles)
			.set({ failureReason: 'backend exited', status: 'failed' })
			.where(eq(directorCycles.id, 'cycle-a'));
		expect((await start('cycle-b')).kind).toBe('started');
	});

	test('records the occurrence that started a scheduled cycle', async () => {
		const executionId = await seedOccurrence();
		expect((await start('cycle-a', executionId)).kind).toBe('started');
		// Reconciliation reads this link to find the occurrence's only child, so a cycle that
		// forgets it finalizes the occurrence as if nothing had run.
		expect((await db.select().from(directorCycles))[0]?.scheduledTaskExecutionId).toBe(
			executionId,
		);
	});

	test('turns an overlapping scheduled occurrence away rather than stacking a cycle', async () => {
		const executionId = await seedOccurrence();
		await start('manual-cycle');
		expect((await start('scheduled-cycle', executionId)).kind).toBe('busy');
		expect(await db.select().from(directorCycles)).toHaveLength(1);
	});

	test('the gate stores the initiator its caller named, unrecorded when none is given', async () => {
		// The Director has three doors: Run Cycle, the chat tool, and the scheduler. Only the last
		// one is aidd deciding, and the value is written at the gate rather than inferred later from
		// scheduled_task_execution_id — an automatic entry point that carries no occurrence would
		// otherwise report itself as operator-initiated.
		const executionId = await seedOccurrence();
		expect((await start('cycle-manual', null, 'operator')).kind).toBe('started');
		await db
			.update(directorCycles)
			.set({ status: 'completed' })
			.where(eq(directorCycles.id, 'cycle-manual'));
		expect((await start('cycle-scheduled', executionId, 'automatic')).kind).toBe('started');
		await db
			.update(directorCycles)
			.set({ status: 'completed' })
			.where(eq(directorCycles.id, 'cycle-scheduled'));
		expect((await start('cycle-silent')).kind).toBe('started');

		expect(
			(await db.select().from(directorCycles)).map((row) => [row.id, row.initiator]).sort(),
		).toEqual([
			['cycle-manual', 'operator'],
			['cycle-scheduled', 'automatic'],
			['cycle-silent', null],
		]);
	});
});
