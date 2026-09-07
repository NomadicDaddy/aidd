import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { HttpError } from '../services/errors.ts';
import { backendNameBody } from './schemas/backend.ts';

const profileBody = t.Object({
	backend: t.Optional(backendNameBody),
	instructions: t.Optional(t.String()),
	model: t.Optional(t.Union([t.String(), t.Null()])),
	reasoningEffort: t.Optional(
		t.Union([
			t.Literal('none'),
			t.Literal('minimal'),
			t.Literal('low'),
			t.Literal('medium'),
			t.Literal('high'),
			t.Literal('xhigh'),
		]),
	),
	role: t.Optional(t.String()),
});

const createSessionBody = t.Object({
	title: t.Optional(t.String()),
});

const messageBody = t.Object({
	content: t.String(),
});

const cycleBody = t.Optional(
	t.Object({
		directive: t.Optional(t.String()),
		sessionId: t.Optional(t.String()),
	}),
);

export function createDirectorRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/director' })
		.get('/fleet', async () => ({ fleet: await context.directorService.getFleetSummary() }))
		.get('/cycles', async () => ({ cycles: await context.directorService.listCycles() }))
		.get('/profile', async () => ({ profile: await context.directorService.getProfile() }))
		.put(
			'/profile',
			async ({ body }) => ({
				profile: await context.directorService.updateProfile(body),
			}),
			{ body: profileBody },
		)
		.get('/suggestions', async () => ({
			suggestions: await context.directorService.listSuggestions(),
		}))
		.post(
			'/cycles',
			async ({ body }) => ({
				cycle: await context.directorService.runCycle(body ?? {}),
			}),
			{ body: cycleBody },
		)
		.get('/chat/sessions', async () => ({
			sessions: await context.directorService.listChatSessions(),
		}))
		.post(
			'/chat/sessions',
			async ({ body }) => ({
				session: await context.directorService.createChatSession(body.title),
			}),
			{ body: createSessionBody },
		)
		.delete(
			'/chat/sessions/:id',
			async ({ params }) => {
				await context.directorService.deleteChatSession(params.id);
				return { ok: true };
			},
			{ params: t.Object({ id: t.String() }) },
		)
		.get(
			'/chat/sessions/:id/messages',
			async ({ params }) => ({
				messages: await context.directorService.listChatMessages(params.id),
			}),
			{ params: t.Object({ id: t.String() }) },
		)
		.post(
			'/chat/sessions/:id/messages',
			async ({ body, params }) => ({
				messages: await context.directorService.sendChatMessage(params.id, body),
			}),
			{ body: messageBody, params: t.Object({ id: t.String() }) },
		)
		.post(
			'/suggestions/:id/dismiss',
			async ({ params }) => {
				const dismissed = await context.directorService.dismissSuggestion(params.id);
				if (!dismissed) {
					throw new HttpError(
						`Suggestion is not pending or does not exist: ${params.id}`,
						409,
					);
				}
				return { ok: true };
			},
			{ params: t.Object({ id: t.String() }) },
		)
		.post(
			'/suggestions/:id/launch',
			async ({ params }) => await context.directorService.launchSuggestion(params.id),
			{ params: t.Object({ id: t.String() }) },
		);
}
