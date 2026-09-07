import { Database } from 'bun:sqlite';

import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { DbCommands } from '../../backend/src/db/commands.ts';
import type { WebDatabase } from '../../backend/src/db/client.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import {
	scheduledTaskExecutions,
	scheduledTaskProjects,
	scheduledTasks,
} from '../../backend/src/db/schema.ts';

let commands: DbCommands;
let db: WebDatabase;

beforeEach(async () => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	({ commands, db } = wrapWebDatabase(sqlite));
	await db.insert(scheduledTasks).values({
		createdAt: 1,
		id: 'task-1',
		name: 'Task',
		nextRunAt: 100,
		projectScope: 'explicit',
		scheduleExpression: '* * * * *',
		scheduleKind: 'cron',
		state: 'active',
		targetJson: '{"type":"recipe","recipeId":"r","applyChanges":false}',
		targetType: 'recipe',
		timezone: 'UTC',
		updatedAt: 1,
	});
	await db.insert(scheduledTaskProjects).values({ projectPath: 'D:/project', taskId: 'task-1' });
});

/** Re-scope the seeded task the way an edit between resolution and claim would. */
async function rescope(projectScope: 'all' | 'explicit' | 'none'): Promise<void> {
	if (projectScope !== 'explicit') await db.delete(scheduledTaskProjects);
	await db
		.update(scheduledTasks)
		.set({ projectScope })
		.where(eq(scheduledTasks.id, 'task-1'))
		.run();
}

function claim(executionId: string, nextRunAt = 200) {
	return commands.claimScheduledTask({
		executionId,
		expectedDueAt: 100,
		nextRunAt,
		now: 101,
		projectPaths: null,
		projectScope: 'explicit',
		taskId: 'task-1',
		trigger: 'scheduled',
	});
}

describe('scheduled task claims', () => {
	test('allows only one claimant for an expected due timestamp', async () => {
		const results = await Promise.all([claim('execution-1'), claim('execution-2')]);
		expect(results.map((result) => result.kind).sort()).toEqual(['claimed', 'missing']);
		expect(await db.select().from(scheduledTaskExecutions)).toHaveLength(1);
	});

	test('records scheduled overlap as skipped and advances cadence', async () => {
		await db.insert(scheduledTaskExecutions).values({
			dueAt: 50,
			id: 'existing',
			projectPathsJson: '["D:/project"]',
			startedAt: 50,
			status: 'running',
			targetJson: '{}',
			taskId: 'task-1',
			trigger: 'scheduled',
		});
		expect((await claim('skipped')).kind).toBe('skipped');
		const rows = await db.select().from(scheduledTaskExecutions);
		expect(rows.find((row) => row.id === 'skipped')?.status).toBe('skipped');
		expect((await db.select().from(scheduledTasks))[0]?.nextRunAt).toBe(200);
	});

	test('rejects Run Now while an execution is active without changing cadence', async () => {
		await db.insert(scheduledTaskExecutions).values({
			dueAt: 50,
			id: 'existing',
			projectPathsJson: '[]',
			startedAt: 50,
			status: 'queued',
			targetJson: '{}',
			taskId: 'task-1',
			trigger: 'manual',
		});
		const result = await commands.claimScheduledTask({
			executionId: 'manual-2',
			expectedDueAt: null,
			nextRunAt: null,
			now: 110,
			projectPaths: null,
			projectScope: 'explicit',
			taskId: 'task-1',
			trigger: 'manual',
		});
		expect(result.kind).toBe('active');
		expect((await db.select().from(scheduledTasks))[0]?.nextRunAt).toBe(100);
	});

	test('snapshots resolved paths for an all-project task', async () => {
		await rescope('all');
		const result = await commands.claimScheduledTask({
			executionId: 'all-projects',
			expectedDueAt: 100,
			nextRunAt: 200,
			now: 101,
			projectPaths: ['D:/one', 'D:/two'],
			projectScope: 'all',
			taskId: 'task-1',
			trigger: 'scheduled',
		});
		expect(result).toMatchObject({
			kind: 'claimed',
			projectPaths: ['D:/one', 'D:/two'],
			projectScope: 'all',
		});
		expect((await db.select().from(scheduledTaskExecutions))[0]?.projectPathsJson).toBe(
			'["D:/one","D:/two"]',
		);
	});

	test('claims a no-project task with an empty path snapshot', async () => {
		await rescope('none');
		const result = await commands.claimScheduledTask({
			executionId: 'no-project',
			expectedDueAt: 100,
			nextRunAt: 200,
			now: 101,
			projectPaths: null,
			projectScope: 'none',
			taskId: 'task-1',
			trigger: 'scheduled',
		});
		expect(result).toMatchObject({
			kind: 'claimed',
			projectPaths: [],
			projectScope: 'none',
		});
		const row = (await db.select().from(scheduledTaskExecutions))[0];
		expect(row?.projectPathsJson).toBe('[]');
		// The snapshot is what tells the history apart from an all-projects run that found nothing.
		expect(row?.projectScope).toBe('none');
	});

	test('reads pinned paths from the task rather than the caller for an explicit scope', async () => {
		const result = await claim('explicit-1');
		expect(result).toMatchObject({
			kind: 'claimed',
			projectPaths: ['D:/project'],
			projectScope: 'explicit',
		});
	});

	for (const stored of ['all', 'explicit', 'none'] as const) {
		for (const requested of ['all', 'explicit', 'none'] as const) {
			if (stored === requested) continue;
			test(`abandons a ${requested} claim against a task re-scoped to ${stored}`, async () => {
				await rescope(stored);
				const result = await commands.claimScheduledTask({
					executionId: `stale-${stored}-${requested}`,
					expectedDueAt: 100,
					nextRunAt: 200,
					now: 101,
					projectPaths: requested === 'all' ? ['D:/one'] : null,
					projectScope: requested,
					taskId: 'task-1',
					trigger: 'scheduled',
				});
				expect(result.kind).toBe('missing');
				expect(await db.select().from(scheduledTaskExecutions)).toHaveLength(0);
			});
		}
	}

	test('abandons an explicit claim once every pinned project is gone', async () => {
		await db.delete(scheduledTaskProjects);
		expect((await claim('emptied')).kind).toBe('missing');
		expect(await db.select().from(scheduledTaskExecutions)).toHaveLength(0);
	});
});
