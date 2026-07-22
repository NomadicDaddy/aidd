import { Elysia } from 'elysia';

import { logApi } from '../logger.ts';
import { incrementRequestCount } from '../services/metricsService.ts';

const REQUEST_ID_HEADER = 'x-request-id';

// Stamps a request id and records request timing. `requestStart` is derived per-request (not held
// on Elysia's shared `store`, which is a single global slot and would be clobbered by concurrent
// requests), so the duration logged on completion always belongs to the request that finished.
export const requestIdPlugin = new Elysia({ name: 'request-id' })
	.derive({ as: 'global' }, ({ request }) => {
		const inbound = request.headers.get(REQUEST_ID_HEADER);
		const requestId = inbound && inbound.length > 0 ? inbound : crypto.randomUUID();
		incrementRequestCount();
		return { requestId, requestStart: performance.now() };
	})
	.onAfterResponse({ as: 'global' }, ({ request, requestId, requestStart, set }) => {
		const url = new URL(request.url);
		const status = typeof set.status === 'number' ? set.status : 200;
		const duration =
			typeof requestStart === 'number'
				? Math.round((performance.now() - requestStart) * 100) / 100
				: undefined;
		// 5xx → error, 4xx → warn, else info: a tail-latency or error spike surfaces at a level
		// log filters already key on, instead of being buried in undifferentiated info lines.
		const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
		logApi(level, `${request.method} ${url.pathname}`, {
			duration,
			method: request.method,
			path: url.pathname,
			requestId,
			status,
		});
	})
	.onAfterHandle({ as: 'global' }, ({ requestId, set }) => {
		set.headers[REQUEST_ID_HEADER] = requestId;
	});
