import { Elysia } from 'elysia';

/**
 * Origin guard, mounted for every panel (loopback-bound or remote).
 * Rejects /api/* and /ws requests whose Origin header is present and is not one of the panel's
 * own origins (`buildAllowedOrigins`). Browsers send Origin on every cross-origin POST, so this
 * stops a page on another site from driving the API with a CORS-simple request: a body-less POST
 * such as /api/v1/admin/shutdown runs without any preflight. Requests without an Origin header
 * (CLI, MCP and bridge clients, same-origin GETs) pass; DNS rebinding, which is same-origin from
 * the browser's view, is handled by the bearer guard's Host check instead.
 */
export function createOriginGuardPlugin(allowedOrigins: ReadonlySet<string>) {
	return new Elysia({ name: 'origin-guard' }).onBeforeHandle(
		{ as: 'global' },
		({ request, set }) => {
			const path = new URL(request.url).pathname;
			if (!path.startsWith('/api/') && !path.startsWith('/ws')) return undefined;

			const origin = request.headers.get('origin');
			if (!origin) return undefined;

			if (!allowedOrigins.has(origin)) {
				set.status = 403;
				return { error: 'Origin not allowed' };
			}

			return undefined;
		},
	);
}
