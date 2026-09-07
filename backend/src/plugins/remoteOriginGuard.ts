import type { ResolvedWebConfig } from 'aidd-shared/config';

import { Elysia } from 'elysia';

import { buildAllowedOrigins } from '../originPolicy.ts';

/**
 * Origin guard activated only when web.allowRemote === true.
 * Rejects /api/* and /ws requests whose Origin header is present and does not
 * match the configured web listener origin. Same-origin requests and requests
 * without an Origin header are allowed through.
 */
export function createRemoteOriginGuardPlugin(webConfig: ResolvedWebConfig) {
	const allowedOrigins = buildAllowedOrigins(webConfig);

	return new Elysia({ name: 'remote-origin-guard' }).onBeforeHandle(
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
