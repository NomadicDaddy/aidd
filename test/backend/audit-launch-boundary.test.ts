import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import type { WebContext } from '../../backend/src/context.ts';
import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createRunsRoutes } from '../../backend/src/routes/runs.ts';
import { createProjectMaturityRoutes } from '../../backend/src/routes/projectMaturity.ts';
import { buildLaunchCommand } from '../../backend/src/services/runLauncher.ts';

test.each([
	['/api/v1/runs', { projectDir: '.', mode: 'audit', auditNames: ['../../spernakit/README'] }],
	['/api/v1/projects/demo/maturity/run-next', { slug: 'audits', auditName: '../README' }],
	['/api/v1/projects/demo/maturity/run-next', { slug: 'audit:../README' }],
])('rejects audit traversal at %s without launching', async (path, body) => {
	let launches = 0;
	const context = {
		projectService: { resolveDiscoveredProject: async () => '.' },
		runService: {
			launchRun: async () => {
				launches++;
				throw new Error('Must not launch');
			},
		},
	} as unknown as WebContext;
	const app = new Elysia()
		.use(errorHandlerPlugin)
		.use(createRunsRoutes(context))
		.use(createProjectMaturityRoutes(context));
	const response = await app.handle(
		new Request(`http://localhost${path}`, {
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		}),
	);
	expect(response.status).toBe(400);
	expect(launches).toBe(0);
});

test('internal launch callers cannot bypass audit-name validation', async () => {
	await expect(
		buildLaunchCommand(
			process.cwd(),
			{ projectDir: '.', mode: 'audit', auditNames: ['../README'] },
			'codex',
		),
	).rejects.toThrow('Invalid audit name');
});
