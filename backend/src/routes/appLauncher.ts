import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

const projectIdParams = t.Object({ id: t.String() });

const projectIdBody = t.Object({
	projectId: t.String({ maxLength: 2000, minLength: 1 }),
});

export function createAppLauncherRoutes(context: WebContext) {
	const launcher = context.appLauncherService;
	return new Elysia({ prefix: '/api/v1/app-launcher' })
		.get('/status', async () => ({ launches: await launcher.getAllStatuses() }))
		.get(
			'/status/:id',
			async ({ params }) => ({ launch: await launcher.getStatus(params.id) }),
			{ params: projectIdParams },
		)
		.post('/start', async ({ body }) => ({ launch: await launcher.start(body.projectId) }), {
			body: projectIdBody,
		})
		.post('/stop', async ({ body }) => ({ launch: await launcher.stop(body.projectId) }), {
			body: projectIdBody,
		});
}
