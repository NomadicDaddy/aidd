import { Elysia } from 'elysia';

import {
	beginDataMovementTrace,
	currentDataMovementTraceId,
	dataMovementTraceHeader,
	disableDataMovementTrace,
	recordDataMovement,
} from '../services/dataMovementTrace.ts';

const TRACE_ID_HEADER = 'X-AIDD-Trace-ID';
const TRACE_ENABLED_HEADER = 'X-AIDD-Trace-Enabled';
const TRACE_HEADER = 'X-AIDD-Data-Trace';

function traceIdFromRequest(request: Request): string {
	return request.headers.get(TRACE_ID_HEADER) || `api-${crypto.randomUUID()}`;
}

function traceRequested(request: Request): boolean {
	const value = request.headers.get(TRACE_ENABLED_HEADER);
	return value === '1' || value === 'true';
}

export const dataMovementTracePlugin = new Elysia({ name: 'data-movement-trace' })
	.onRequest(({ request }) => {
		if (!traceRequested(request)) {
			disableDataMovementTrace();
			return;
		}
		beginDataMovementTrace(traceIdFromRequest(request));
		const url = new URL(request.url);
		recordDataMovement({
			category: 'request',
			operation: 'api.request',
			source: request.method,
			summary: {
				route: url.pathname,
			},
			target: url.pathname,
		});
	})
	.onAfterHandle({ as: 'global' }, ({ request, response, set }) => {
		if (currentDataMovementTraceId() === null) return;
		const url = new URL(request.url);
		recordDataMovement({
			category: 'response',
			operation: 'api.response',
			source: request.method,
			status: String(set.status ?? 200),
			summary: {
				route: url.pathname,
				value: response,
			},
			target: url.pathname,
		});
		set.headers[TRACE_HEADER] = dataMovementTraceHeader();
	})
	.onError({ as: 'global' }, ({ error, request, set }) => {
		if (currentDataMovementTraceId() === null) return;
		const url = new URL(request.url);
		recordDataMovement({
			category: 'response',
			operation: 'api.error',
			source: request.method,
			status: String(set.status ?? 500),
			summary: {
				message: error instanceof Error ? error.message : String(error),
				route: url.pathname,
			},
			target: url.pathname,
		});
		set.headers[TRACE_HEADER] = dataMovementTraceHeader();
	});
