import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { HttpError } from '../services/errors.ts';

export function createPipelineSessionsRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/pipeline-sessions' })
		.get(
			'/',
			async ({ query }) => {
				const options = {
					...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
					...(query.limit !== undefined ? { limit: query.limit } : {}),
				};
				const page = await context.pipelineService.listSessions(options);
				return { nextCursor: page.nextCursor, sessions: page.items };
			},
			{
				query: t.Object({
					cursor: t.Optional(t.String()),
					limit: t.Optional(t.Numeric({ maximum: 200, minimum: 1 })),
				}),
			}
		)
		.get(
			'/:id/report',
			async ({ params }) => {
				const report = await context.pipelineService.getReport(params.id);
				if (!report) throw new HttpError(`Pipeline session not found: ${params.id}`, 404);
				return { report };
			},
			{ params: t.Object({ id: t.String() }) }
		)
		.post(
			'/:id/stop',
			async ({ params }) => {
				await context.pipelineService.stopSession(params.id);
				return { ok: true };
			},
			{ params: t.Object({ id: t.String() }) }
		);
}
