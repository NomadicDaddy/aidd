import {
	createTraceId,
	isTraceEnabled,
	parseBackendTraceHeader,
	summarizeBody,
	traceDataMovement,
} from '../lib/dataMovementTrace.ts';
import { currentAuthToken, reportUnauthorized } from '../stores/authTokenStore.ts';

export class ApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

export function parseResponseJson(text: string): unknown {
	if (text.length === 0) {
		return null;
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

interface ApiTraceContext {
	method: string;
	path: string;
	startedAt: number;
	traceId: string;
}

type ApiHeadersInit = ConstructorParameters<typeof Headers>[0];

function traceHeaders(traceId: string): Record<string, string> {
	if (!isTraceEnabled()) return {};
	return {
		'X-AIDD-Trace-Enabled': '1',
		'X-AIDD-Trace-ID': traceId,
	};
}

function authHeaders(): Record<string, string> {
	const token = currentAuthToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

function headerRecord(initHeaders: ApiHeadersInit): Record<string, string> {
	const headers = new Headers(initHeaders);
	return Object.fromEntries(headers.entries());
}

function traceBackendHeader(response: Response, trace: ApiTraceContext): void {
	const backendTrace = parseBackendTraceHeader(response.headers.get('X-AIDD-Data-Trace'));
	if (!backendTrace) return;
	const durationMs =
		typeof backendTrace.durationMs === 'number' && Number.isFinite(backendTrace.durationMs)
			? backendTrace.durationMs
			: undefined;
	const event: Parameters<typeof traceDataMovement>[0] = {
		category: 'metadata',
		layer: 'backend',
		operation: 'request.summary',
		source: trace.method,
		status: response.ok ? 'success' : 'error',
		summary: backendTrace,
		target: trace.path,
		traceId: trace.traceId,
	};
	if (durationMs !== undefined) event.durationMs = durationMs;
	traceDataMovement(event);
}

async function readJson<T>(response: Response, trace: ApiTraceContext): Promise<T> {
	const text = await response.text();
	const parsed = parseResponseJson(text);
	const durationMs = Math.round(performance.now() - trace.startedAt);
	traceDataMovement({
		category: 'response',
		durationMs,
		layer: 'api',
		operation: 'api.response',
		source: trace.method,
		status: String(response.status),
		summary: {
			body: summarizeBody(parsed),
			bytes: text.length,
			ok: response.ok,
			statusText: response.statusText,
		},
		target: trace.path,
		traceId: trace.traceId,
	});
	traceBackendHeader(response, trace);
	if (!response.ok) {
		const message =
			typeof parsed === 'object' && parsed !== null && 'error' in parsed
				? String(parsed.error)
				: response.statusText || `Request failed with status ${response.status}`;
		if (response.status === 401) reportUnauthorized();
		traceDataMovement({
			category: 'response',
			durationMs,
			layer: 'api',
			operation: 'api.error',
			source: trace.method,
			status: String(response.status),
			summary: { message },
			target: trace.path,
			traceId: trace.traceId,
		});
		throw new ApiError(message, response.status);
	}
	if (parsed === undefined) {
		traceDataMovement({
			category: 'response',
			durationMs,
			layer: 'api',
			operation: 'api.error',
			source: trace.method,
			status: String(response.status),
			summary: { message: 'Invalid JSON response' },
			target: trace.path,
			traceId: trace.traceId,
		});
		throw new ApiError('Invalid JSON response', response.status);
	}
	return parsed as T;
}

export async function apiGet<T>(
	path: string,
	options: { signal?: AbortSignal | undefined } = {}
): Promise<T> {
	const traceId = createTraceId('api');
	const startedAt = performance.now();
	traceDataMovement({
		category: 'request',
		layer: 'api',
		operation: 'api.request',
		source: 'GET',
		summary: { headers: { 'x-aidd-trace-id': traceId } },
		target: path,
		traceId,
	});
	const init: RequestInit = {
		headers: {
			...authHeaders(),
			...traceHeaders(traceId),
		},
	};
	if (options.signal !== undefined) init.signal = options.signal;
	return await readJson<T>(await fetch(path, init), {
		method: 'GET',
		path,
		startedAt,
		traceId,
	});
}

export async function apiSend<T>(
	path: string,
	method: 'DELETE' | 'PATCH' | 'POST' | 'PUT',
	body?: unknown
): Promise<T> {
	const traceId = createTraceId('api');
	const startedAt = performance.now();
	const init: RequestInit = { method };
	if (body !== undefined) {
		init.body = JSON.stringify(body);
		init.headers = { 'content-type': 'application/json' };
	}
	init.headers = {
		...authHeaders(),
		...headerRecord(init.headers),
		...traceHeaders(traceId),
	};
	traceDataMovement({
		category: 'request',
		layer: 'api',
		operation: 'api.request',
		source: method,
		summary: {
			body: body === undefined ? undefined : summarizeBody(body),
			headers: { 'x-aidd-trace-id': traceId },
		},
		target: path,
		traceId,
	});
	return await readJson<T>(await fetch(path, init), { method, path, startedAt, traceId });
}

export type AuthProbeResult = 'authorized' | 'unauthorized' | 'unreachable';

/**
 * Probes a guarded endpoint to classify the current access token. `apiGet` already
 * opens the token prompt on a 401, so callers inherit that side effect for free; the
 * returned value lets them distinguish a rejected token from an unreachable server.
 */
export async function probeAuth(): Promise<AuthProbeResult> {
	try {
		await apiGet('/api/v1/health');
		return 'authorized';
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) return 'unauthorized';
		return 'unreachable';
	}
}
