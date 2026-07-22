import { describe, expect, test } from 'bun:test';
import type { WebContext } from '../../backend/src/context.ts';
import { createAdminRoutes } from '../../backend/src/routes/admin.ts';

function postShutdown(app: ReturnType<typeof createAdminRoutes>): Promise<Response> {
	return app.handle(
		new Request('http://127.0.0.1:3210/api/v1/admin/shutdown', { method: 'POST' })
	);
}

function postRestart(app: ReturnType<typeof createAdminRoutes>): Promise<Response> {
	return app.handle(
		new Request('http://127.0.0.1:3210/api/v1/admin/restart', { method: 'POST' })
	);
}

describe('admin shutdown route', () => {
	test('returns 202 and invokes requestShutdown with the api reason', async () => {
		const reasons: string[] = [];
		const context = {
			requestShutdown: (reason: string) => reasons.push(reason),
		} as unknown as WebContext;
		const response = await postShutdown(createAdminRoutes(context));
		const body = (await response.json()) as { status: string };
		expect(response.status).toBe(202);
		expect(body.status).toBe('shutting-down');
		expect(reasons).toEqual(['api']);
	});

	test('still responds 202 when no requestShutdown is wired (test harness)', async () => {
		const context = {} as unknown as WebContext;
		const response = await postShutdown(createAdminRoutes(context));
		expect(response.status).toBe(202);
	});

	test('returns 202 and invokes requestRestart with the api reason', async () => {
		const reasons: string[] = [];
		const context = {
			requestRestart: (reason: string) => {
				reasons.push(reason);
				return true;
			},
		} as unknown as WebContext;
		const response = await postRestart(createAdminRoutes(context));
		const body = (await response.json()) as { status: string };
		expect(response.status).toBe(202);
		expect(body.status).toBe('restarting');
		expect(reasons).toEqual(['api']);
	});

	test('returns 503 when restart is not wired', async () => {
		const context = {} as unknown as WebContext;
		const response = await postRestart(createAdminRoutes(context));
		const body = (await response.json()) as { error: string };
		expect(response.status).toBe(503);
		expect(body.error).toContain('Restart is unavailable');
	});
});
