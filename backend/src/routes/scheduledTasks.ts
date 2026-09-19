import type {
	ScheduledTaskSchedule,
	ScheduledTaskState,
	ScheduledTaskUpdate,
	ScheduledTaskWrite,
} from 'aidd-shared/contracts/scheduled-tasks';

import { SAFE_BACKEND_ARG_PATTERN } from 'aidd-shared/backends/safe-arg';
import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { backendNameBody } from './schemas/backend.ts';

const idParams = t.Object({ id: t.String({ minLength: 1 }) });
const safeLaunchValue = t.String({ pattern: SAFE_BACKEND_ARG_PATTERN });
const timezone = t.String({ minLength: 1 });
const scheduleBody = t.Union([
	t.Object({ kind: t.Literal('once'), runAt: t.String({ minLength: 1 }), timezone }),
	t.Object({
		expression: t.String({ minLength: 1 }),
		kind: t.Literal('cron'),
		timezone,
	}),
]);
const launchTargetBody = t.Optional(
	t.Object({
		backend: t.Optional(backendNameBody),
		model: t.Optional(safeLaunchValue),
		reasoningEffort: t.Optional(safeLaunchValue),
	}),
);
const targetBody = t.Union([
	t.Object({
		applyChanges: t.Boolean(),
		launchTarget: launchTargetBody,
		parameters: t.Optional(t.Record(t.String(), t.String())),
		recipeId: t.String({ minLength: 1 }),
		type: t.Literal('recipe'),
	}),
	t.Object({
		args: t.String(),
		executionIntent: t.Union([t.Literal('apply-changes'), t.Literal('review-only')]),
		launchTarget: launchTargetBody,
		skillId: t.String({ minLength: 1 }),
		type: t.Literal('skill'),
	}),
	t.Object({
		auditAll: t.Boolean(),
		auditNames: t.Array(t.String()),
		launchTarget: launchTargetBody,
		review: t.Boolean(),
		type: t.Literal('audit'),
	}),
	// A directive names no catalog entry: the prompt is the instruction, so it is the only
	// required field beyond the intent the run is launched under.
	t.Object({
		executionIntent: t.Union([t.Literal('apply-changes'), t.Literal('review-only')]),
		launchTarget: launchTargetBody,
		prompt: t.String({ minLength: 1 }),
		type: t.Literal('directive'),
	}),
]);
const writeFields = {
	confirmUnattendedMutation: t.Optional(t.Boolean()),
	name: t.String({ minLength: 1 }),
	// Non-empty only for the 'explicit' scope. Absent scope is derived from this for payloads
	// that omit it.
	projects: t.Array(t.String()),
	projectScope: t.Optional(t.Union([t.Literal('all'), t.Literal('explicit'), t.Literal('none')])),
	schedule: scheduleBody,
};
const writeBody = t.Object({ ...writeFields, target: targetBody });
// The Director cycle is deliberately absent from the target union: it is built in, so it is never
// created or re-pointed over HTTP. An edit may therefore omit the target and keep the stored one,
// which is how the built-in task's name and cadence stay editable.
const updateBody = t.Object({ ...writeFields, target: t.Optional(targetBody) });

export function createScheduledTaskRoutes(context: WebContext) {
	const service = () => {
		if (!context.scheduledTaskService)
			throw new Error('Scheduled task service is unavailable.');
		return context.scheduledTaskService;
	};
	return new Elysia({ prefix: '/api/v1/scheduled-tasks' })
		.get('/', async ({ query }) => {
			const states = query.states
				?.split(',')
				.filter((state): state is ScheduledTaskState =>
					['active', 'archived', 'completed', 'paused'].includes(state),
				);
			return { tasks: await service().list(states) };
		})
		.post('/preview', ({ body }) => service().preview(body as ScheduledTaskSchedule), {
			body: scheduleBody,
		})
		.post(
			'/',
			async ({ body }) => ({
				task: await service().create(body as ScheduledTaskWrite),
			}),
			{ body: writeBody },
		)
		.get('/:id', async ({ params }) => ({ task: await service().detail(params.id) }), {
			params: idParams,
		})
		.put(
			'/:id',
			async ({ body, params }) => ({
				task: await service().update(params.id, body as ScheduledTaskUpdate),
			}),
			{ body: updateBody, params: idParams },
		)
		.get(
			'/:id/executions',
			async ({ params, query }) =>
				await service().executions(
					params.id,
					query.limit ? Number(query.limit) : undefined,
					query.offset ? Number(query.offset) : undefined,
				),
			{
				params: idParams,
				query: t.Object({
					limit: t.Optional(t.Numeric({ maximum: 100, minimum: 1 })),
					offset: t.Optional(t.Numeric({ minimum: 0 })),
				}),
			},
		)
		.post(
			'/:id/pause',
			async ({ params }) => {
				await service().pause(params.id);
				return { ok: true };
			},
			{ params: idParams },
		)
		.post(
			'/:id/resume',
			async ({ params }) => {
				await service().resume(params.id);
				return { ok: true };
			},
			{ params: idParams },
		)
		.post(
			'/:id/run',
			async ({ params }) => ({
				execution: await service().runNow(params.id),
			}),
			{ params: idParams },
		)
		.delete(
			'/:id',
			async ({ params }) => {
				await service().archive(params.id);
				return { ok: true };
			},
			{ params: idParams },
		);
}
