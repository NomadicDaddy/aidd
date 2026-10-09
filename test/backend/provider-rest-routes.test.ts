import type { ProviderRestState } from 'aidd-shared/contracts/provider-rest';

import { defaultWebConfig, type ResolvedConfig } from 'aidd-shared/config';
import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';

import type { WebContext } from '../../backend/src/context.ts';

import { errorHandlerPlugin } from '../../backend/src/plugins/errorHandler.ts';
import { createLaunchTargetRoutes } from '../../backend/src/routes/launchTarget.ts';
import { ProviderRestingError } from '../../backend/src/services/errors.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function makeApp() {
	const dataDir = await testTempDir('provider-rest-routes-');
	const config: ResolvedConfig = {
		cli: 'claude-code',
		dirtyTreeThreshold: 50,
		idleNudgeTimeoutSeconds: 600,
		idleTimeoutSeconds: 900,
		maxConsecutiveTimeoutRetries: 2,
		maxIterations: null,
		noClean: false,
		noWorkBackoffMs: 30_000,
		providerRestSubstitutes: ['codex', 'native'],
		quitOnAbort: 0,
		rateLimitBackoffSeconds: 300,
		rateLimitBufferSeconds: 60,
		reasoningEffort: 'medium',
		timeoutSeconds: 3600,
		web: { ...defaultWebConfig, dataDir },
	};
	const context = { config } as unknown as WebContext;
	return new Elysia().use(errorHandlerPlugin).use(createLaunchTargetRoutes(context));
}

function send(
	app: Awaited<ReturnType<typeof makeApp>>,
	method: string,
	path: string,
	body?: object,
) {
	return app.handle(
		new Request(`http://localhost/api/v1/provider-rest${path}`, {
			method,
			...(body === undefined
				? {}
				: { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
		}),
	);
}

async function state(app: Awaited<ReturnType<typeof makeApp>>): Promise<ProviderRestState> {
	return (await (await send(app, 'GET', '')).json()) as ProviderRestState;
}

describe('provider rest routes', () => {
	test('rest by hand, read it back, then end it', async () => {
		const app = await makeApp();
		const until = new Date(Date.now() + 60 * 60_000).toISOString();
		const put = await send(app, 'PUT', '/codex', { reason: ' quota ', until });
		expect(put.status).toBe(200);

		const listed = await state(app);
		expect(listed.substitutes).toEqual(['codex', 'native']);
		expect(listed.autoRestBackends).toEqual(['claude-code', 'codex', 'grok']);
		expect(listed.rests.map((rest) => [rest.backend, rest.reason, rest.source])).toEqual([
			['codex', 'quota', 'manual'],
		]);

		expect((await send(app, 'DELETE', '/codex')).status).toBe(200);
		expect((await state(app)).rests).toEqual([]);
	});

	test('a rest must end in the future, at a time that parses', async () => {
		const app = await makeApp();
		const past = new Date(Date.now() - 60_000).toISOString();
		expect((await send(app, 'PUT', '/codex', { until: past })).status).toBe(400);
		expect((await send(app, 'PUT', '/codex', { until: 'later' })).status).toBe(400);
		expect((await send(app, 'PUT', '/not-a-backend', { until: past })).status).toBe(400);
	});
});

describe('the launch refusal body', () => {
	test('carries the details a launch surface needs to offer the alternative', async () => {
		const app = new Elysia().use(errorHandlerPlugin).get('/refuse', () => {
			throw new ProviderRestingError('codex is resting until 17:40 (quota)', {
				alternative: 'claude-code',
				backend: 'codex',
				code: 'provider_resting',
				reason: 'quota',
				until: '2026-10-09T22:40:00.000Z',
			});
		});
		const response = await app.handle(new Request('http://localhost/refuse'));
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			alternative: 'claude-code',
			backend: 'codex',
			code: 'provider_resting',
			error: 'codex is resting until 17:40 (quota)',
			reason: 'quota',
			until: '2026-10-09T22:40:00.000Z',
		});
	});
});
