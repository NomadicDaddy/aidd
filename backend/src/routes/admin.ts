import { Elysia } from 'elysia';

import type { WebContext } from '../context.ts';

/**
 * Administrative control of the running web backend.
 *
 * `POST /api/v1/admin/shutdown` triggers the same graceful shutdown path as a
 * SIGINT/SIGTERM signal: close the listener, force-drop active connections, and
 * tear down the DB worker. This exists because Windows has no reliable way to
 * deliver a catchable termination signal to a detached backend — `scripts/stop-web.ts`
 * calls this endpoint so Bun closes its own socket cleanly, rather than `taskkill /F`
 * which abandons the socket and leaves an orphaned port binding.
 *
 * Authorization follows the same model as the rest of `/api/*`: loopback callers
 * (the local stopper) are exempt from the bearer-token guard; off-host callers must
 * present the token. Restart first starts a detached supervisor that waits for
 * the current listener to release its port, then follows the same deferred
 * shutdown path.
 */
export function createAdminRoutes(context: WebContext) {
	return new Elysia({ prefix: '/api/v1/admin' })
		.post('/shutdown', ({ set }) => {
			set.status = 202;
			context.requestShutdown?.('api');
			return { status: 'shutting-down' };
		})
		.post('/restart', ({ set }) => {
			if (!context.requestRestart?.('api')) {
				set.status = 503;
				return { error: 'Restart is unavailable in this process.' };
			}
			set.status = 202;
			return { status: 'restarting' };
		});
}
