import { describe, expect, test } from 'bun:test';
import { ApiError, apiGet, apiSend, parseResponseJson } from '../../frontend/src/api/client.ts';

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type TestGlobal = typeof globalThis & {
	document?: unknown;
	window?: unknown;
};

function withFetch<T>(fn: FetchFn, run: () => Promise<T>): Promise<T> {
	const original = globalThis.fetch;
	globalThis.fetch = fn as typeof fetch;
	return run().finally(() => {
		globalThis.fetch = original;
	});
}

function withTracePreference<T>(enabled: boolean, run: () => Promise<T>): Promise<T> {
	const testGlobal = globalThis as TestGlobal;
	const originalWindow = testGlobal.window;
	const originalDocument = testGlobal.document;
	const storage = new Map<string, string>([['aidd.traceDataMovement', enabled ? '1' : '0']]);
	const localStorage = {
		getItem: (key: string) => storage.get(key) ?? null,
		removeItem: (key: string) => {
			storage.delete(key);
		},
		setItem: (key: string, value: string) => {
			storage.set(key, value);
		},
	};
	// Partial double: only the members the client reads. The cast is needed because the DOM lib
	// (pulled in transitively via xterm's typings) declares the real Window shape on globalThis.
	testGlobal.window = {
		localStorage,
		location: new URL('http://localhost/'),
	} as unknown as TestGlobal['window'];
	delete testGlobal.document;
	return run().finally(() => {
		if (originalWindow === undefined) delete testGlobal.window;
		else testGlobal.window = originalWindow;
		if (originalDocument === undefined) delete testGlobal.document;
		else testGlobal.document = originalDocument;
	});
}

describe('parseResponseJson', () => {
	test('returns null for an empty body', () => {
		expect(parseResponseJson('')).toBeNull();
	});

	test('returns parsed JSON for a valid body', () => {
		expect(parseResponseJson('{"foo":1}')).toEqual({ foo: 1 });
	});

	test('returns undefined for malformed JSON instead of throwing', () => {
		expect(parseResponseJson('<html>nope</html>')).toBeUndefined();
	});
});

describe('readJson via apiGet', () => {
	test('non-JSON error body surfaces ApiError with status, not SyntaxError', async () => {
		const fakeFetch: FetchFn = async () =>
			new Response('<!doctype html><h1>Bad Gateway</h1>', {
				status: 502,
				statusText: 'Bad Gateway',
				headers: { 'content-type': 'text/html' },
			});

		await withFetch(fakeFetch, async () => {
			try {
				await apiGet('/api/v1/anything');
				throw new Error('expected ApiError');
			} catch (error) {
				expect(error).toBeInstanceOf(ApiError);
				const apiError = error as ApiError;
				expect(apiError.status).toBe(502);
				expect(apiError.message).toBe('Bad Gateway');
			}
		});
	});

	test('JSON error body with error field forwards the error message', async () => {
		const fakeFetch: FetchFn = async () =>
			new Response(JSON.stringify({ error: 'forbidden zone' }), {
				status: 403,
				statusText: 'Forbidden',
				headers: { 'content-type': 'application/json' },
			});

		await withFetch(fakeFetch, async () => {
			try {
				await apiGet('/api/v1/anything');
				throw new Error('expected ApiError');
			} catch (error) {
				expect(error).toBeInstanceOf(ApiError);
				expect((error as ApiError).status).toBe(403);
				expect((error as ApiError).message).toBe('forbidden zone');
			}
		});
	});

	test('skill-launch validation errors preserve the server guidance', async () => {
		const fakeFetch: FetchFn = async () =>
			new Response(
				JSON.stringify({
					error: 'executionIntent must be either "review-only" or "apply-changes"',
				}),
				{
					status: 400,
					statusText: 'Bad Request',
					headers: { 'content-type': 'application/json' },
				}
			);

		await withFetch(fakeFetch, async () => {
			try {
				await apiSend('/api/v1/skills/demo/run', 'POST', {
					projectDir: 'D:/applications/aidd',
				});
				throw new Error('expected ApiError');
			} catch (error) {
				expect(error).toBeInstanceOf(ApiError);
				expect((error as ApiError).status).toBe(400);
				expect((error as ApiError).message).toBe(
					'executionIntent must be either "review-only" or "apply-changes"'
				);
			}
		});
	});

	test('malformed JSON on a 200 response throws ApiError("Invalid JSON response")', async () => {
		const fakeFetch: FetchFn = async () =>
			new Response('not really json', {
				status: 200,
				statusText: 'OK',
				headers: { 'content-type': 'application/json' },
			});

		await withFetch(fakeFetch, async () => {
			try {
				await apiGet('/api/v1/anything');
				throw new Error('expected ApiError');
			} catch (error) {
				expect(error).toBeInstanceOf(ApiError);
				expect((error as ApiError).status).toBe(200);
				expect((error as ApiError).message).toBe('Invalid JSON response');
			}
		});
	});

	test('empty 200 body resolves to null', async () => {
		const fakeFetch: FetchFn = async () => new Response('', { status: 200, statusText: 'OK' });

		await withFetch(fakeFetch, async () => {
			const result = await apiGet<null>('/api/v1/anything');
			expect(result).toBeNull();
		});
	});

	test('empty error body still throws ApiError with fallback message and status', async () => {
		const fakeFetch: FetchFn = async () => new Response('', { status: 500, statusText: '' });

		await withFetch(fakeFetch, async () => {
			try {
				await apiGet('/api/v1/anything');
				throw new Error('expected ApiError');
			} catch (error) {
				expect(error).toBeInstanceOf(ApiError);
				expect((error as ApiError).status).toBe(500);
				expect((error as ApiError).message).toBe('Request failed with status 500');
			}
		});
	});

	test('apiSend serializes JSON body and round-trips JSON responses', async () => {
		let capturedInit: RequestInit | undefined;
		const fakeFetch: FetchFn = async (_input, init) => {
			capturedInit = init;
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		};

		await withFetch(fakeFetch, async () => {
			const result = await apiSend<{ ok: boolean }>('/api/v1/things', 'POST', { name: 'x' });
			expect(result).toEqual({ ok: true });
			expect(capturedInit?.method).toBe('POST');
			expect(capturedInit?.body).toBe(JSON.stringify({ name: 'x' }));
		});
	});

	test('api requests omit trace headers when tracing is disabled', async () => {
		let traceHeader: string | null = null;
		let traceEnabledHeader: string | null = null;
		const fakeFetch: FetchFn = async (_input, init) => {
			const headers = new Headers(init?.headers);
			traceHeader = headers.get('X-AIDD-Trace-ID');
			traceEnabledHeader = headers.get('X-AIDD-Trace-Enabled');
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		};

		await withTracePreference(false, async () => {
			await withFetch(fakeFetch, async () => {
				const result = await apiGet<{ ok: boolean }>('/api/v1/things');
				expect(result).toEqual({ ok: true });
				expect(traceHeader).toBeNull();
				expect(traceEnabledHeader).toBeNull();
			});
		});
	});

	test('api requests send trace headers and accept backend summaries when tracing is enabled', async () => {
		let traceHeader: string | null = null;
		let traceEnabledHeader: string | null = null;
		const originalConsoleInfo = console.info;
		const originalConsoleGroupCollapsed = console.groupCollapsed;
		const originalConsoleGroupEnd = console.groupEnd;
		const labels: string[] = [];
		console.info = (() => {}) as typeof console.info;
		console.groupCollapsed = ((label?: string) => {
			labels.push(String(label));
		}) as typeof console.groupCollapsed;
		console.groupEnd = (() => {}) as typeof console.groupEnd;
		const fakeFetch: FetchFn = async (_input, init) => {
			const headers = new Headers(init?.headers);
			traceHeader = headers.get('X-AIDD-Trace-ID');
			traceEnabledHeader = headers.get('X-AIDD-Trace-Enabled');
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: {
					'X-AIDD-Data-Trace': JSON.stringify({
						counts: { file: 1 },
						durationMs: 12,
						events: [{ category: 'file', operation: 'read.text' }],
						traceId: traceHeader,
					}),
					'content-type': 'application/json',
				},
			});
		};

		try {
			await withTracePreference(true, async () => {
				await withFetch(fakeFetch, async () => {
					const result = await apiSend<{ ok: boolean }>('/api/v1/things', 'POST', {
						name: 'x',
					});
					expect(result).toEqual({ ok: true });
					expect(traceHeader?.startsWith('api-')).toBe(true);
					expect(traceEnabledHeader).toBe('1');
					expect(labels).toContain('[aidd] POST /api/v1/things request');
					expect(labels).toContain(
						'[aidd] POST /api/v1/things backend 12ms events 1 file:1'
					);
				});
			});
		} finally {
			console.info = originalConsoleInfo;
			console.groupCollapsed = originalConsoleGroupCollapsed;
			console.groupEnd = originalConsoleGroupEnd;
		}
	});
});
