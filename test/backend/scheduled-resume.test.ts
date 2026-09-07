import { Database } from 'bun:sqlite';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';

import type { WebDatabaseHandle } from '../../backend/src/db/client.ts';
import type { ProjectService } from '../../backend/src/services/projectService.ts';
import type { ScheduledTaskSchedule } from '../../shared/src/contracts/scheduled-tasks.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createScheduledTaskRoutes } from '../../backend/src/routes/scheduledTasks.ts';
import { HttpError } from '../../backend/src/services/errors.ts';
import { ScheduledTaskRepository } from '../../backend/src/services/scheduled/repository.ts';
import { ScheduledTaskService } from '../../backend/src/services/scheduledTaskService.ts';

const ELAPSED_RUN_AT = '2000-01-01T00:00:00.000Z';
const FUTURE_RUN_AT = '2099-01-01T00:00:00.000Z';

describe('scheduled task resume', () => {
	let repository: ScheduledTaskRepository;
	let service: ScheduledTaskService;
	let sqlite: Database;

	beforeEach(() => {
		sqlite = new Database(':memory:');
		migrateWebDatabase(sqlite);
		const database = wrapWebDatabase(sqlite) as unknown as WebDatabaseHandle;
		const projectService = {
			getAllowedRoots: () => ['D:/applications'],
			listProjects: async () => ({ projects: [] }),
			resolveProjectPath: async (path: string) => path,
		} as unknown as ProjectService;
		repository = new ScheduledTaskRepository(database.db, database.commands);
		service = new ScheduledTaskService(
			database,
			projectService,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
		);
	});

	afterEach(() => {
		service.dispose();
		sqlite.close();
	});

	async function seedTask(id: string, schedule: ScheduledTaskSchedule) {
		return await repository.write(
			id,
			{
				name: 'Resume contract',
				projects: [],
				projectScope: 'none',
				schedule,
				target: { type: 'director' },
			},
			Date.now(),
		);
	}

	function routeApp() {
		return new Elysia()
			.use(errorHandlerPlugin)
			.use(createScheduledTaskRoutes({ scheduledTaskService: service } as never));
	}

	test('the service rejects an elapsed one-time task without reporting a no-op success', async () => {
		const task = await seedTask('elapsed-once', {
			kind: 'once',
			runAt: ELAPSED_RUN_AT,
			timezone: 'UTC',
		});
		expect(task.state).toBe('completed');

		try {
			await service.resume(task.id);
			throw new Error('Expected resume to fail.');
		} catch (error) {
			expect(error).toBeInstanceOf(HttpError);
			expect((error as HttpError).status).toBe(409);
			expect((error as Error).message).toContain('Edit its schedule before resuming');
		}

		const unchanged = await service.detail(task.id);
		expect(unchanged.state).toBe('completed');
		expect(unchanged.nextRunAt).toBeNull();
	});

	test('the resume route activates recurring and future one-time tasks', async () => {
		const recurring = await seedTask('recurring', {
			expression: '0 2 * * *',
			kind: 'cron',
			timezone: 'UTC',
		});
		const futureOnce = await seedTask('future-once', {
			kind: 'once',
			runAt: FUTURE_RUN_AT,
			timezone: 'UTC',
		});
		await service.pause(recurring.id);
		await service.pause(futureOnce.id);

		for (const task of [recurring, futureOnce]) {
			const response = await routeApp().handle(
				new Request(`http://localhost/api/v1/scheduled-tasks/${task.id}/resume`, {
					method: 'POST',
				}),
			);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true });
			const resumed = await service.detail(task.id);
			expect(resumed.state).toBe('active');
			expect(resumed.nextRunAt).not.toBeNull();
		}
		expect((await service.detail(futureOnce.id)).nextRunAt).toBe(Date.parse(FUTURE_RUN_AT));
	});

	test('the resume route returns an actionable conflict for an elapsed one-time task', async () => {
		const task = await seedTask('elapsed-route', {
			kind: 'once',
			runAt: ELAPSED_RUN_AT,
			timezone: 'UTC',
		});
		const response = await routeApp().handle(
			new Request(`http://localhost/api/v1/scheduled-tasks/${task.id}/resume`, {
				method: 'POST',
			}),
		);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: 'This task has no future occurrence. Edit its schedule before resuming.',
		});
	});

	test('editing an elapsed one-time task to a future instant makes it active again', async () => {
		const task = await seedTask('elapsed-edit', {
			kind: 'once',
			runAt: ELAPSED_RUN_AT,
			timezone: 'UTC',
		});
		const updated = await service.update(task.id, {
			name: task.name,
			projects: [],
			projectScope: 'none',
			schedule: { kind: 'once', runAt: FUTURE_RUN_AT, timezone: 'UTC' },
		});

		expect(updated.state).toBe('active');
		expect(updated.nextRunAt).toBe(Date.parse(FUTURE_RUN_AT));
	});
});
