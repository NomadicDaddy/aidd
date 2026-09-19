import { expect, test } from 'bun:test';

import { Elysia } from 'elysia';

import type { WebContext } from '../../backend/src/context.ts';
import type { ScheduledTaskService } from '../../backend/src/services/scheduledTaskService.ts';

import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createScheduledTaskRoutes } from '../../backend/src/routes/scheduledTasks.ts';
import { HttpError } from '../../backend/src/services/errors.ts';

test('scheduled execution history accepts bounded pagination', async () => {
	let pagination: [number, number] | undefined;
	const service = {
		executions: async (_id: string, limit: number, offset: number) => {
			pagination = [limit, offset];
			return { executions: [], nextOffset: null };
		},
	} as unknown as ScheduledTaskService;
	const app = new Elysia()
		.use(errorHandlerPlugin)
		.use(createScheduledTaskRoutes({ scheduledTaskService: service } as unknown as WebContext));
	const response = await app.handle(
		new Request('http://localhost/api/v1/scheduled-tasks/task/executions?limit=2&offset=4'),
	);
	expect(response.status).toBe(200);
	expect(pagination).toEqual([2, 4]);
	expect(await response.json()).toEqual({ executions: [], nextOffset: null });
});

test('an empty project selection is accepted as the all-projects task shape', async () => {
	let received: unknown;
	const service = {
		create: async (input: unknown) => {
			received = input;
			return { id: 'task' };
		},
	} as unknown as ScheduledTaskService;
	const app = new Elysia()
		.use(errorHandlerPlugin)
		.use(createScheduledTaskRoutes({ scheduledTaskService: service } as unknown as WebContext));
	const response = await app.handle(
		new Request('http://localhost/api/v1/scheduled-tasks', {
			body: JSON.stringify({
				name: 'Every project',
				projects: [],
				schedule: { expression: '0 9 * * *', kind: 'cron', timezone: 'UTC' },
				target: {
					args: '',
					executionIntent: 'review-only',
					skillId: 'diary-entry',
					type: 'skill',
				},
			}),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		}),
	);
	expect(response.status).toBe(200);
	expect(received).toMatchObject({ projects: [] });
});

test('refuses to create a Director cycle over HTTP', async () => {
	let created = false;
	const service = {
		create: async () => {
			created = true;
			return { id: 'task' };
		},
	} as unknown as ScheduledTaskService;
	const app = new Elysia()
		.use(errorHandlerPlugin)
		.use(createScheduledTaskRoutes({ scheduledTaskService: service } as unknown as WebContext));
	const response = await app.handle(
		new Request('http://localhost/api/v1/scheduled-tasks', {
			body: JSON.stringify({
				name: 'Second Director',
				projects: [],
				projectScope: 'none',
				schedule: { expression: '0 9 * * *', kind: 'cron', timezone: 'UTC' },
				target: { type: 'director' },
			}),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		}),
	);
	// The target union has no director variant, so the request is rejected by validation and the
	// service is never reached. There is one Director cycle and the panel seeds it.
	expect(response.status).toBe(400);
	expect(created).toBe(false);
});

test('an edit may omit the target and keep the stored one', async () => {
	let received: unknown;
	const service = {
		update: async (_id: string, input: unknown) => {
			received = input;
			return { id: 'director-task' };
		},
	} as unknown as ScheduledTaskService;
	const app = new Elysia()
		.use(errorHandlerPlugin)
		.use(createScheduledTaskRoutes({ scheduledTaskService: service } as unknown as WebContext));
	const response = await app.handle(
		new Request('http://localhost/api/v1/scheduled-tasks/director-task', {
			body: JSON.stringify({
				name: 'Director fleet cycle',
				projects: [],
				projectScope: 'none',
				schedule: { expression: '0 6 * * *', kind: 'cron', timezone: 'UTC' },
			}),
			headers: { 'content-type': 'application/json' },
			method: 'PUT',
		}),
	);
	expect(response.status).toBe(200);
	expect(received).toMatchObject({ name: 'Director fleet cycle', projectScope: 'none' });
	expect((received as { target?: unknown }).target).toBeUndefined();
});

test('archiving a built-in task is refused with a conflict', async () => {
	const service = {
		archive: async () => {
			throw new HttpError('Built-in tasks cannot be archived. Pause it instead.', 409);
		},
	} as unknown as ScheduledTaskService;
	const app = new Elysia()
		.use(errorHandlerPlugin)
		.use(createScheduledTaskRoutes({ scheduledTaskService: service } as unknown as WebContext));
	const response = await app.handle(
		new Request('http://localhost/api/v1/scheduled-tasks/director-task', { method: 'DELETE' }),
	);
	expect(response.status).toBe(409);
	expect(await response.text()).toContain('Pause it instead');
});

test('pause and resume reach the service', async () => {
	const calls: string[] = [];
	const service = {
		pause: async (id: string) => void calls.push(`pause:${id}`),
		resume: async (id: string) => void calls.push(`resume:${id}`),
	} as unknown as ScheduledTaskService;
	const app = new Elysia()
		.use(errorHandlerPlugin)
		.use(createScheduledTaskRoutes({ scheduledTaskService: service } as unknown as WebContext));
	for (const action of ['pause', 'resume']) {
		const response = await app.handle(
			new Request(`http://localhost/api/v1/scheduled-tasks/director-task/${action}`, {
				method: 'POST',
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	}
	// Pause and Resume are the built-in task's on/off switch, so they must work on it the same way
	// they do on any other task.
	expect(calls).toEqual(['pause:director-task', 'resume:director-task']);
});

test('Run Now exposes an active-occurrence conflict as HTTP 409', async () => {
	const service = {
		runNow: async () => {
			throw new HttpError('This task already has an active execution.', 409);
		},
	} as unknown as ScheduledTaskService;
	const app = new Elysia()
		.use(errorHandlerPlugin)
		.use(createScheduledTaskRoutes({ scheduledTaskService: service } as unknown as WebContext));
	const response = await app.handle(
		new Request('http://localhost/api/v1/scheduled-tasks/task/run', {
			body: '{}',
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		}),
	);
	expect(response.status).toBe(409);
	expect(await response.text()).toContain('active execution');
});

test('a directive task is created from its prompt and rejected without one', async () => {
	let received: unknown;
	const service = {
		create: async (input: unknown) => {
			received = input;
			return { id: 'task' };
		},
	} as unknown as ScheduledTaskService;
	const app = new Elysia()
		.use(errorHandlerPlugin)
		.use(createScheduledTaskRoutes({ scheduledTaskService: service } as unknown as WebContext));
	const post = (target: unknown) =>
		app.handle(
			new Request('http://localhost/api/v1/scheduled-tasks', {
				body: JSON.stringify({
					name: 'Nightly sweep',
					projects: [],
					schedule: { expression: '0 9 * * *', kind: 'cron', timezone: 'UTC' },
					target,
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			}),
		);

	const accepted = await post({
		executionIntent: 'review-only',
		prompt: 'Summarize the open findings.',
		type: 'directive',
	});
	expect(accepted.status).toBe(200);
	expect(received).toMatchObject({
		target: {
			executionIntent: 'review-only',
			prompt: 'Summarize the open findings.',
			type: 'directive',
		},
	});

	received = undefined;
	const rejected = await post({ executionIntent: 'review-only', prompt: '', type: 'directive' });
	expect(rejected.status).toBe(400);
	expect(received).toBeUndefined();
});
