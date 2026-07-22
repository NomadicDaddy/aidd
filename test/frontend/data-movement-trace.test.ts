import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
	disableDataTrace,
	enableDataTrace,
	getDataTraceStatus,
	isTraceEnabled,
	parseBackendTraceHeader,
	summarizeBody,
	traceDataMovement,
} from '../../frontend/src/lib/dataMovementTrace.ts';

const originalConsoleInfo = console.info;
const originalConsoleGroupCollapsed = console.groupCollapsed;
const originalConsoleGroupEnd = console.groupEnd;

function installWindow(url = 'http://localhost/runs'): Map<string, string> {
	const storage = new Map<string, string>();
	const localStorage = {
		getItem: (key: string) => storage.get(key) ?? null,
		removeItem: (key: string) => {
			storage.delete(key);
		},
		setItem: (key: string, value: string) => {
			storage.set(key, value);
		},
	};
	(globalThis as unknown as { window: unknown }).window = {
		localStorage,
		location: new URL(url),
	};
	return storage;
}

function installTraceMeta(content: string | null): void {
	(globalThis as unknown as { document: unknown }).document = {
		querySelector: (selectors: string) =>
			selectors === 'meta[name="aidd-trace-default"]' && content !== null
				? { getAttribute: () => content }
				: null,
	};
}

afterEach(() => {
	delete (globalThis as unknown as { window?: unknown }).window;
	delete (globalThis as unknown as { document?: unknown }).document;
	console.info = originalConsoleInfo;
	console.groupCollapsed = originalConsoleGroupCollapsed;
	console.groupEnd = originalConsoleGroupEnd;
	mock.restore();
});

describe('data movement tracing', () => {
	test('enables through query string and persists the preference', () => {
		const storage = installWindow('http://localhost/runs?traceData=1');

		expect(isTraceEnabled()).toBe(true);
		expect(storage.get('aidd.traceDataMovement')).toBe('1');
		expect(getDataTraceStatus().source).toBe('query');
	});

	test('debug API helpers toggle localStorage opt-in', () => {
		const storage = installWindow();
		console.info = mock(() => {}) as typeof console.info;
		console.groupCollapsed = mock(() => {}) as typeof console.groupCollapsed;
		console.groupEnd = mock(() => {}) as typeof console.groupEnd;

		enableDataTrace();
		expect(storage.get('aidd.traceDataMovement')).toBe('1');
		expect(isTraceEnabled()).toBe(true);

		disableDataTrace();
		expect(storage.get('aidd.traceDataMovement')).toBe('0');
		expect(isTraceEnabled()).toBe(false);
	});

	test('defaults to disabled unless injected config flag enables it', () => {
		installWindow();
		expect(isTraceEnabled()).toBe(false);
		expect(getDataTraceStatus().source).toBe('config');

		installWindow();
		installTraceMeta('true');
		expect(isTraceEnabled()).toBe(true);
		expect(getDataTraceStatus().source).toBe('config');

		installWindow();
		installTraceMeta('false');
		expect(isTraceEnabled()).toBe(false);
		expect(getDataTraceStatus().source).toBe('config');
	});

	test('summaries redact sensitive fields and avoid full large payload dumps', () => {
		const summary = summarizeBody({
			items: Array.from({ length: 12 }, (_, id) => ({ id })),
			name: 'visible',
			password: 'super-secret-value',
			token: 'secret-token',
		});
		const encoded = JSON.stringify(summary);

		expect(encoded).toContain('[redacted]');
		expect(encoded).toContain('"length":12');
		expect(encoded).not.toContain('super-secret-value');
		expect(encoded).not.toContain('secret-token');
	});

	test('parses backend trace header defensively', () => {
		expect(parseBackendTraceHeader('{"traceId":"abc","events":[]}')).toEqual({
			events: [],
			traceId: 'abc',
		});
		expect(parseBackendTraceHeader('not json')).toEqual({ parseError: true });
		expect(parseBackendTraceHeader(null)).toBeNull();
	});

	test('logs compact grouped records only when enabled', () => {
		installWindow();
		installTraceMeta('false');
		const info = mock(() => {});
		const groupCollapsed = mock(() => {});
		const groupEnd = mock(() => {});
		console.info = info as typeof console.info;
		console.groupCollapsed = groupCollapsed as typeof console.groupCollapsed;
		console.groupEnd = groupEnd as typeof console.groupEnd;

		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'disabled',
		});
		expect(info).toHaveBeenCalledTimes(0);

		enableDataTrace();
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'enabled',
			summary: { id: 'abc' },
		});
		expect(groupCollapsed).toHaveBeenCalledWith('[aidd] ui.trace.enabled');
		expect(groupCollapsed).toHaveBeenCalledWith('[aidd] ui.enabled id=abc');
		expect(info).toHaveBeenCalledTimes(2);
		expect(groupEnd).toHaveBeenCalledTimes(2);
	});

	test('formats endpoint-first labels for API traces', () => {
		installWindow();
		installTraceMeta('true');
		const groupCollapsed = mock(() => {});
		console.info = mock(() => {}) as typeof console.info;
		console.groupCollapsed = groupCollapsed as typeof console.groupCollapsed;
		console.groupEnd = mock(() => {}) as typeof console.groupEnd;

		traceDataMovement({
			category: 'request',
			layer: 'api',
			operation: 'api.request',
			source: 'GET',
			target: '/api/v1/projects',
		});
		traceDataMovement({
			category: 'response',
			durationMs: 38,
			layer: 'api',
			operation: 'api.response',
			source: 'GET',
			status: '200',
			summary: { bytes: 43110 },
			target: '/api/v1/projects',
		});
		traceDataMovement({
			category: 'metadata',
			durationMs: 31,
			layer: 'backend',
			operation: 'request.summary',
			source: 'GET',
			summary: {
				counts: { file: 3, metadata: 4, request: 1 },
				events: Array.from({ length: 8 }, () => ({})),
			},
			target: '/api/v1/projects',
		});

		expect(groupCollapsed).toHaveBeenCalledWith('[aidd] GET /api/v1/projects request');
		expect(groupCollapsed).toHaveBeenCalledWith(
			'[aidd] GET /api/v1/projects 200 38ms response 42.1 KB'
		);
		expect(groupCollapsed).toHaveBeenCalledWith(
			'[aidd] GET /api/v1/projects backend 31ms events 8 file:3 metadata:4 request:1'
		);
	});

	test('adds useful fallback summary fields without exposing sensitive values', () => {
		installWindow();
		installTraceMeta('true');
		const info = mock(() => {});
		const groupCollapsed = mock(() => {});
		console.info = info as typeof console.info;
		console.groupCollapsed = groupCollapsed as typeof console.groupCollapsed;
		console.groupEnd = mock(() => {}) as typeof console.groupEnd;

		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'project.tab.change',
			summary: { password: 'do-not-log', projectId: 'demo', tab: 'features' },
		});
		traceDataMovement({
			category: 'response',
			durationMs: 2,
			layer: 'api',
			operation: 'api.response',
			source: 'GET',
			status: '200',
			summary: {
				body: summarizeBody({
					name: 'visible',
					password: 'super-secret-value',
					token: 'secret-token',
				}),
			},
			target: '/api/v1/secrets',
		});

		expect(groupCollapsed).toHaveBeenCalledWith(
			'[aidd] ui.project.tab.change projectId=demo tab=features'
		);
		const labels = JSON.stringify(groupCollapsed.mock.calls);
		const records = JSON.stringify(info.mock.calls);
		expect(labels).not.toContain('do-not-log');
		expect(labels).not.toContain('super-secret-value');
		expect(labels).not.toContain('secret-token');
		expect(records).toContain('[redacted]');
		expect(records).not.toContain('super-secret-value');
		expect(records).not.toContain('secret-token');
	});

	test('formats websocket messages by type and compact status', () => {
		installWindow();
		installTraceMeta('true');
		const groupCollapsed = mock(() => {});
		const info = mock(() => {});
		console.info = info as typeof console.info;
		console.groupCollapsed = groupCollapsed as typeof console.groupCollapsed;
		console.groupEnd = mock(() => {}) as typeof console.groupEnd;

		traceDataMovement({
			category: 'event',
			layer: 'socket',
			operation: 'socket.message',
			summary: {
				bytes: 716,
				runId: 'run_1',
				stream: 'stdout',
				type: 'run_output',
			},
		});
		traceDataMovement({
			category: 'event',
			layer: 'socket',
			operation: 'socket.message',
			summary: {
				runId: 'run_1',
				status: 'running',
				type: 'run_status',
			},
		});
		traceDataMovement({
			category: 'event',
			layer: 'socket',
			operation: 'socket.message',
			summary: {
				status: 'confirmed',
				type: 'connected',
			},
		});

		expect(groupCollapsed).toHaveBeenCalledWith(
			'[aidd] socket run_output runId=run_1 stream=stdout chunk=716 B'
		);
		expect(groupCollapsed).toHaveBeenCalledWith(
			'[aidd] socket run_status runId=run_1 status=running'
		);
		expect(groupCollapsed).toHaveBeenCalledWith('[aidd] socket connected status=confirmed');
		expect(JSON.stringify(info.mock.calls)).not.toContain('"chunk":"');
	});
});
