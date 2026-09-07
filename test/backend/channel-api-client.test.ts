import { describe, expect, test } from 'bun:test';

import { createApiClient, isBackendReachable } from '../../backend/src/channels/apiClient.ts';
import { serveNeverSettling } from '../_helpers/never-settling-server.ts';

interface CapturedRequest {
	init: RequestInit;
	url: string;
}

describe('channel API client transport', () => {
	test('sends authenticated requests with bounded redirect-safe init', async () => {
		const calls: CapturedRequest[] = [];
		const client = createApiClient(
			{ authToken: 'secret', port: 3210 },
			{
				fetchImpl(url, init): Promise<Response> {
					calls.push({ init, url });
					return Promise.resolve(Response.json({ id: 'run-1' }));
				},
			},
		);

		await client.post('/api/v1/runs', { mode: 'coding' });

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe('http://127.0.0.1:3210/api/v1/runs');
		expect(calls[0]?.init.method).toBe('POST');
		expect(calls[0]?.init.redirect).toBe('error');
		expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
		expect(calls[0]?.init.headers).toEqual({
			authorization: 'Bearer secret',
			'content-type': 'application/json',
		});
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ mode: 'coding' });
	});

	test('aborts a never-settling ordinary request at its request bound', async () => {
		const calls: CapturedRequest[] = [];
		const server = serveNeverSettling();
		try {
			const client = createApiClient(
				{ port: 3210 },
				{
					fetchImpl(url, init): Promise<Response> {
						calls.push({ init, url });
						return fetch(`http://127.0.0.1:${server.port}`, init);
					},
					requestTimeoutMs: 100,
				},
			);

			await expect(client.get('/api/v1/projects')).rejects.toThrow();
			expect(calls[0]?.init.signal?.aborted).toBe(true);
		} finally {
			await server.stop(true);
		}
	});

	test('keeps health probes bounded and rejects metadata targets before fetch', async () => {
		const calls: CapturedRequest[] = [];
		const reachable = await isBackendReachable('http://127.0.0.1:3210', {
			fetchImpl(url, init): Promise<Response> {
				calls.push({ init, url });
				return Promise.resolve(new Response(null, { status: 204 }));
			},
		});

		expect(reachable).toBe(true);
		expect(calls[0]?.url).toBe('http://127.0.0.1:3210/api/v1/health');
		expect(calls[0]?.init.redirect).toBe('error');
		expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);

		let unsafeFetchCalls = 0;
		expect(
			await isBackendReachable('http://169.254.169.254/latest', {
				fetchImpl(): Promise<Response> {
					unsafeFetchCalls += 1;
					return Promise.resolve(new Response());
				},
			}),
		).toBe(false);
		expect(unsafeFetchCalls).toBe(0);
	});

	test('returns unreachable when a never-settling health probe times out', async () => {
		const calls: CapturedRequest[] = [];
		const server = serveNeverSettling();
		try {
			expect(
				await isBackendReachable('http://127.0.0.1:3210', {
					fetchImpl(url, init): Promise<Response> {
						calls.push({ init, url });
						return fetch(`http://127.0.0.1:${server.port}`, init);
					},
					healthTimeoutMs: 100,
				}),
			).toBe(false);
			expect(calls[0]?.init.signal?.aborted).toBe(true);
		} finally {
			await server.stop(true);
		}
	});
});
