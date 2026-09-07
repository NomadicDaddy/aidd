import { Database } from 'bun:sqlite';

import { expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { WebDatabaseHandle } from '../../backend/src/db/client.ts';
import type { ScheduledTaskDispatcher } from '../../backend/src/services/scheduled/dispatch.ts';
import type { ScheduledTaskValidator } from '../../backend/src/services/scheduled/validator.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import {
	directorCycles,
	pipelineSessions,
	runs,
	scheduledTaskExecutions,
	scheduledTaskProjects,
	scheduledTasks,
} from '../../backend/src/db/schema.ts';
import { ScheduledTaskRepository } from '../../backend/src/services/scheduled/repository.ts';
import { ScheduledTaskRuntime } from '../../backend/src/services/scheduled/runtime.ts';

test('startup coalesces an overdue task into one catch-up execution', async () => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	const database: WebDatabaseHandle = {
		close: async () => sqlite.close(),
		commands: wrapped.commands,
		db: wrapped.db,
		path: ':memory:',
		sqlite,
	};
	await wrapped.db.insert(scheduledTasks).values({
		createdAt: 1,
		id: 'overdue',
		name: 'Overdue',
		nextRunAt: 10,
		projectScope: 'explicit',
		scheduleExpression: '0 9 * * *',
		scheduleKind: 'cron',
		targetJson: '{"type":"recipe","recipeId":"recipe","applyChanges":false}',
		targetType: 'recipe',
		timezone: 'UTC',
		updatedAt: 1,
	});
	await wrapped.db
		.insert(scheduledTaskProjects)
		.values({ projectPath: 'D:/project', taskId: 'overdue' });
	const dispatches: string[] = [];
	const dispatcher = {
		dispatch: async (executionId: string) => {
			dispatches.push(executionId);
			return { children: [], errors: ['launch rejected'] };
		},
	} as unknown as ScheduledTaskDispatcher;
	const validator = {
		validateTarget: async () => {},
	} as unknown as ScheduledTaskValidator;
	const runtime = new ScheduledTaskRuntime(
		database,
		dispatcher,
		new ScheduledTaskRepository(wrapped.db, wrapped.commands),
		validator,
	);

	runtime.start();
	runtime.start();
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if ((await wrapped.db.select().from(scheduledTaskExecutions))[0]?.status === 'failed')
			break;
		await Bun.sleep(5);
	}
	runtime.dispose();

	const executions = await wrapped.db.select().from(scheduledTaskExecutions);
	expect(executions).toHaveLength(1);
	expect(executions[0]).toMatchObject({ status: 'failed', trigger: 'catch_up' });
	expect(executions[0]?.projectPathsJson).toBe('["D:/project"]');
	expect(dispatches).toHaveLength(1);
	expect((await wrapped.db.select().from(scheduledTasks))[0]?.nextRunAt).toBeGreaterThan(
		Date.now(),
	);
	await database.close();
});

test('an all-project occurrence resolves current projects before its atomic claim', async () => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	const database: WebDatabaseHandle = {
		close: async () => sqlite.close(),
		commands: wrapped.commands,
		db: wrapped.db,
		path: ':memory:',
		sqlite,
	};
	await wrapped.db.insert(scheduledTasks).values({
		createdAt: 1,
		id: 'all-projects',
		name: 'All projects',
		nextRunAt: 10,
		scheduleExpression: '0 9 * * *',
		scheduleKind: 'cron',
		targetJson:
			'{"type":"skill","skillId":"diary-entry","args":"","executionIntent":"review-only"}',
		targetType: 'skill',
		timezone: 'UTC',
		updatedAt: 1,
	});
	let dispatchedProjects: string[] = [];
	const dispatcher = {
		dispatch: async (input: { projectPaths: string[] }) => {
			dispatchedProjects = input.projectPaths;
			return { children: [], errors: ['launch rejected'] };
		},
	} as unknown as ScheduledTaskDispatcher;
	const validator = {
		resolveDispatchProjects: async () => ['D:/one', 'D:/two'],
		validateTarget: async () => {},
	} as unknown as ScheduledTaskValidator;
	const runtime = new ScheduledTaskRuntime(
		database,
		dispatcher,
		new ScheduledTaskRepository(wrapped.db, wrapped.commands),
		validator,
	);

	runtime.start();
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if ((await wrapped.db.select().from(scheduledTaskExecutions))[0]?.status === 'failed')
			break;
		await Bun.sleep(5);
	}
	runtime.dispose();

	const [execution] = await wrapped.db.select().from(scheduledTaskExecutions);
	expect(execution?.projectPathsJson).toBe('["D:/one","D:/two"]');
	expect(dispatchedProjects).toEqual(['D:/one', 'D:/two']);
	await database.close();
});

test('a no-project occurrence dispatches once and never discovers projects', async () => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	const database: WebDatabaseHandle = {
		close: async () => sqlite.close(),
		commands: wrapped.commands,
		db: wrapped.db,
		path: ':memory:',
		sqlite,
	};
	await wrapped.db.insert(scheduledTasks).values({
		createdAt: 1,
		id: 'diary',
		name: 'Development diary',
		nextRunAt: 10,
		projectScope: 'none',
		scheduleExpression: '0 9 * * *',
		scheduleKind: 'cron',
		targetJson:
			'{"type":"skill","skillId":"devdiary-update","args":"","executionIntent":"apply-changes"}',
		targetType: 'skill',
		timezone: 'UTC',
		updatedAt: 1,
	});
	const inputs: { projectPaths: string[]; scope: string }[] = [];
	const dispatcher = {
		dispatch: async (input: { projectPaths: string[]; scope: string }) => {
			inputs.push({ projectPaths: input.projectPaths, scope: input.scope });
			return {
				children: [
					{ id: 'diary-session', projectPath: null, status: 'queued', type: 'session' },
				],
				errors: [],
			};
		},
	} as unknown as ScheduledTaskDispatcher;
	const validator = {
		resolveDispatchProjects: async () => {
			throw new Error('project discovery must not run for a no-project task');
		},
		validateTarget: async () => {},
	} as unknown as ScheduledTaskValidator;
	const runtime = new ScheduledTaskRuntime(
		database,
		dispatcher,
		new ScheduledTaskRepository(wrapped.db, wrapped.commands),
		validator,
	);

	runtime.start();
	for (let attempt = 0; attempt < 40; attempt += 1) {
		if ((await wrapped.db.select().from(scheduledTaskExecutions))[0]?.childrenJson) break;
		await Bun.sleep(5);
	}
	runtime.dispose();

	expect(inputs).toEqual([{ projectPaths: [], scope: 'none' }]);
	const [execution] = await wrapped.db.select().from(scheduledTaskExecutions);
	// An empty snapshot under this scope is the design, not a discovery failure, so the occurrence
	// must not be finalized the way an all-project task with nothing to run would be.
	expect(execution).toMatchObject({ projectScope: 'none', status: 'running' });
	expect(execution?.projectPathsJson).toBe('[]');
	expect(execution?.childrenJson).toContain('diary-session');
	await database.close();
});

// The Director's fast path writes a director_cycles row and no run row at all. An occurrence whose
// only child is a cycle therefore looks childless to anything that reads runs and pipeline sessions
// alone, and would finalize as failed on the very next tick after dispatch.
test('a director occurrence follows its cycle rather than finalizing childless', async () => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	const database: WebDatabaseHandle = {
		close: async () => sqlite.close(),
		commands: wrapped.commands,
		db: wrapped.db,
		path: ':memory:',
		sqlite,
	};
	await wrapped.db.insert(scheduledTasks).values({
		createdAt: 1,
		id: 'director',
		name: 'Director fleet cycle',
		nextRunAt: 10,
		projectScope: 'none',
		scheduleExpression: '0 */12 * * *',
		scheduleKind: 'cron',
		systemKey: 'director',
		targetJson: '{"type":"director"}',
		targetType: 'director',
		timezone: 'UTC',
		updatedAt: 1,
	});
	const dispatcher = {
		// What the real launcher does: insert the running cycle, then report it as the occurrence's
		// only child.
		dispatch: async (input: { executionId: string }) => {
			await wrapped.db.insert(directorCycles).values({
				id: 'cycle-1',
				scheduledTaskExecutionId: input.executionId,
				startedAt: Date.now(),
				status: 'running',
			});
			return {
				children: [{ id: 'cycle-1', projectPath: null, status: 'running', type: 'cycle' }],
				errors: [],
			};
		},
	} as unknown as ScheduledTaskDispatcher;
	const runtime = new ScheduledTaskRuntime(
		database,
		dispatcher,
		new ScheduledTaskRepository(wrapped.db, wrapped.commands),
		{ validateTarget: async () => {} } as unknown as ScheduledTaskValidator,
	);

	runtime.start();
	for (let attempt = 0; attempt < 40; attempt += 1) {
		if ((await wrapped.db.select().from(scheduledTaskExecutions))[0]?.childrenJson) break;
		await Bun.sleep(5);
	}
	runtime.wake();
	await Bun.sleep(30);
	expect((await wrapped.db.select().from(scheduledTaskExecutions))[0]?.status).toBe('running');

	await wrapped.db.update(directorCycles).set({ status: 'completed' });
	runtime.wake();
	for (let attempt = 0; attempt < 40; attempt += 1) {
		if ((await wrapped.db.select().from(scheduledTaskExecutions))[0]?.status !== 'running')
			break;
		await Bun.sleep(5);
	}
	runtime.dispose();

	const [execution] = await wrapped.db.select().from(scheduledTaskExecutions);
	expect(execution?.status).toBe('completed');
	expect(execution?.childrenJson).toContain('cycle-1');
	// The whole point: the outcome came from the cycle, with nothing in either table to read.
	expect(await wrapped.db.select().from(runs)).toHaveLength(0);
	expect(await wrapped.db.select().from(pipelineSessions)).toHaveLength(0);
	await database.close();
});

test('a failed claim does not block the other tasks due in the same tick', async () => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	const database: WebDatabaseHandle = {
		close: async () => sqlite.close(),
		commands: wrapped.commands,
		db: wrapped.db,
		path: ':memory:',
		sqlite,
	};
	const target =
		'{"type":"skill","skillId":"diary-entry","args":"","executionIntent":"review-only"}';
	await wrapped.db.insert(scheduledTasks).values([
		// Ordered first by nextRunAt, so its claim is the one that throws.
		{
			createdAt: 1,
			id: 'all-projects',
			name: 'All projects',
			nextRunAt: 5,
			scheduleExpression: '0 9 * * *',
			scheduleKind: 'cron',
			targetJson: target,
			targetType: 'skill',
			timezone: 'UTC',
			updatedAt: 1,
		},
		{
			createdAt: 1,
			id: 'explicit',
			name: 'Explicit',
			nextRunAt: 10,
			projectScope: 'explicit',
			scheduleExpression: '0 9 * * *',
			scheduleKind: 'cron',
			targetJson: target,
			targetType: 'skill',
			timezone: 'UTC',
			updatedAt: 1,
		},
	]);
	await wrapped.db
		.insert(scheduledTaskProjects)
		.values({ projectPath: 'D:/project', taskId: 'explicit' });
	const dispatcher = {
		dispatch: async () => ({ children: [], errors: ['launch rejected'] }),
	} as unknown as ScheduledTaskDispatcher;
	const validator = {
		resolveDispatchProjects: async () => {
			throw new Error('project discovery failed');
		},
		validateTarget: async () => {},
	} as unknown as ScheduledTaskValidator;
	const runtime = new ScheduledTaskRuntime(
		database,
		dispatcher,
		new ScheduledTaskRepository(wrapped.db, wrapped.commands),
		validator,
	);

	runtime.start();
	for (let attempt = 0; attempt < 40; attempt += 1) {
		if ((await wrapped.db.select().from(scheduledTaskExecutions)).length > 0) break;
		await Bun.sleep(5);
	}
	runtime.dispose();

	const executions = await wrapped.db.select().from(scheduledTaskExecutions);
	expect(executions).toHaveLength(1);
	expect(executions[0]?.taskId).toBe('explicit');
	expect((await wrapped.db.select().from(scheduledTasks))[0]?.nextRunAt).toBe(5);
	await database.close();
});

test('a tick does not finalize a Run Now execution that is still dispatching', async () => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	const database: WebDatabaseHandle = {
		close: async () => sqlite.close(),
		commands: wrapped.commands,
		db: wrapped.db,
		path: ':memory:',
		sqlite,
	};
	await wrapped.db.insert(scheduledTasks).values({
		createdAt: 1,
		id: 'manual',
		name: 'Manual',
		nextRunAt: Date.now() + 3_600_000,
		projectScope: 'explicit',
		scheduleExpression: '0 9 * * *',
		scheduleKind: 'cron',
		targetJson: '{"type":"recipe","recipeId":"recipe","applyChanges":true}',
		targetType: 'recipe',
		timezone: 'UTC',
		updatedAt: 1,
	});
	await wrapped.db
		.insert(scheduledTaskProjects)
		.values({ projectPath: 'D:/project', taskId: 'manual' });
	// Hold the dispatch open so the execution sits claimed with no child rows yet — the exact
	// window a concurrent reconcile could mistake for a run that produced nothing.
	let release = (): void => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const dispatcher = {
		dispatch: async (input: { executionId: string }) => {
			await held;
			await wrapped.db.insert(pipelineSessions).values({
				id: 'session-1',
				parametersJson: '{}',
				projectName: 'project',
				projectPath: 'D:/project',
				recipeId: 'recipe',
				recipeName: 'recipe',
				scheduledTaskExecutionId: input.executionId,
				startedAt: Date.now(),
				status: 'running',
				totalSteps: 1,
			});
			return {
				children: [
					{
						id: 'session-1',
						projectPath: 'D:/project',
						status: 'running',
						type: 'session',
					},
				],
				errors: [],
			};
		},
	} as unknown as ScheduledTaskDispatcher;
	const repository = new ScheduledTaskRepository(wrapped.db, wrapped.commands);
	const runtime = new ScheduledTaskRuntime(database, dispatcher, repository, {
		validateTarget: async () => {},
	} as unknown as ScheduledTaskValidator);

	const task = (await repository.get('manual'))!;
	const running = runtime.runNow(task);
	for (let attempt = 0; attempt < 40; attempt += 1) {
		if ((await wrapped.db.select().from(scheduledTaskExecutions))[0]?.status === 'running')
			break;
		await Bun.sleep(5);
	}
	runtime.wake();
	await Bun.sleep(30);
	expect((await wrapped.db.select().from(scheduledTaskExecutions))[0]?.status).toBe('running');

	release();
	await running;
	// Run Now re-arms the timer when it is done, so let that reconcile land: it sees the session it
	// launched still running and must leave the occurrence alone.
	await Bun.sleep(30);
	runtime.dispose();
	const [execution] = await wrapped.db.select().from(scheduledTaskExecutions);
	expect(execution?.status).toBe('running');
	expect(execution?.completedAt).toBeNull();
	expect(execution?.childrenJson).toContain('session-1');
	await database.close();
});

test('Run Now re-arms the timer so its occurrence is reconciled', async () => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	const database: WebDatabaseHandle = {
		close: async () => sqlite.close(),
		commands: wrapped.commands,
		db: wrapped.db,
		path: ':memory:',
		sqlite,
	};
	// Not due for an hour, which is what the timer was sleeping on when Run Now was pressed.
	await wrapped.db.insert(scheduledTasks).values({
		createdAt: 1,
		id: 'director',
		name: 'Director fleet cycle',
		nextRunAt: Date.now() + 3_600_000,
		projectScope: 'none',
		scheduleExpression: '0 */12 * * *',
		scheduleKind: 'cron',
		systemKey: 'director',
		targetJson: '{"type":"director"}',
		targetType: 'director',
		timezone: 'UTC',
		updatedAt: 1,
	});
	const dispatcher = {
		dispatch: async (input: { executionId: string }) => {
			await wrapped.db.insert(directorCycles).values({
				completedAt: Date.now(),
				id: 'cycle-1',
				scheduledTaskExecutionId: input.executionId,
				startedAt: Date.now(),
				status: 'completed',
			});
			return {
				children: [
					{ id: 'cycle-1', projectPath: null, status: 'completed', type: 'cycle' },
				],
				errors: [],
			};
		},
	} as unknown as ScheduledTaskDispatcher;
	const repository = new ScheduledTaskRepository(wrapped.db, wrapped.commands);
	const runtime = new ScheduledTaskRuntime(database, dispatcher, repository, {
		validateTarget: async () => {},
	} as unknown as ScheduledTaskValidator);

	await runtime.runNow((await repository.get('director'))!);
	// No wake() here on purpose. Run Now dispatches outside the timer, so if it does not re-arm one
	// itself the occurrence reads "running" until the next scheduled tick, which is an hour away.
	for (let attempt = 0; attempt < 60; attempt += 1) {
		if ((await wrapped.db.select().from(scheduledTaskExecutions))[0]?.status !== 'running')
			break;
		await Bun.sleep(5);
	}
	runtime.dispose();

	const [execution] = await wrapped.db.select().from(scheduledTaskExecutions);
	expect(execution?.status).toBe('completed');
	expect(execution?.completedAt).not.toBeNull();
	expect(execution?.childrenJson).toContain('cycle-1');
	await database.close();
});

test('Run now dispatches with the manual trigger, and the timer with a scheduled one', async () => {
	// The trigger has to survive the claim and reach the dispatcher so Run now is recorded as
	// operator-initiated while timer work is recorded as automatic.
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	const database: WebDatabaseHandle = {
		close: async () => sqlite.close(),
		commands: wrapped.commands,
		db: wrapped.db,
		path: ':memory:',
		sqlite,
	};
	// Not yet due, so the timer leaves it alone until the second half of this test moves it.
	await wrapped.db.insert(scheduledTasks).values({
		createdAt: 1,
		id: 'diary',
		name: 'Development diary',
		nextRunAt: Date.now() + 3_600_000,
		projectScope: 'none',
		scheduleExpression: '0 9 * * *',
		scheduleKind: 'cron',
		targetJson:
			'{"type":"skill","skillId":"devdiary-update","args":"","executionIntent":"apply-changes"}',
		targetType: 'skill',
		timezone: 'UTC',
		updatedAt: 1,
	});
	const triggers: string[] = [];
	const dispatcher = {
		dispatch: async (input: { trigger: string }) => {
			triggers.push(input.trigger);
			return {
				children: [
					{ id: 'diary-session', projectPath: null, status: 'queued', type: 'session' },
				],
				errors: [],
			};
		},
	} as unknown as ScheduledTaskDispatcher;
	const validator = { validateTarget: async () => {} } as unknown as ScheduledTaskValidator;
	const repository = new ScheduledTaskRepository(wrapped.db, wrapped.commands);
	const runtime = new ScheduledTaskRuntime(database, dispatcher, repository, validator);

	const task = await repository.get('diary');
	await runtime.runNow(task!);
	expect(triggers).toEqual(['manual']);
	expect((await wrapped.db.select().from(scheduledTaskExecutions))[0]?.trigger).toBe('manual');

	// The same task, the same target, reached by the timer instead of by hand.
	await wrapped.db
		.update(scheduledTasks)
		.set({ nextRunAt: 10 })
		.where(eq(scheduledTasks.id, 'diary'));
	runtime.wake();
	for (let attempt = 0; attempt < 40; attempt += 1) {
		if (triggers.length > 1) break;
		await Bun.sleep(5);
	}
	runtime.dispose();

	expect(triggers).toEqual(['manual', 'scheduled']);
	await database.close();
});
