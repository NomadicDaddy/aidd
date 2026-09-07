import { describe, expect, test } from 'bun:test';

import { createTelegramClient } from '../../backend/src/bridge/telegram.ts';
import { serveNeverSettling } from '../_helpers/never-settling-server.ts';

interface CapturedRequest {
	init: RequestInit;
	url: string;
}

describe('Telegram transport', () => {
	test('sends through the fixed guarded endpoint with bounded redirect-safe init', async () => {
		const calls: CapturedRequest[] = [];
		const client = createTelegramClient('token-a', {
			fetchImpl(url, init): Promise<Response> {
				calls.push({ init, url });
				return Promise.resolve(Response.json({ ok: true, result: true }));
			},
		});

		await client.sendMessage(100, 'hello');

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe('https://api.telegram.org/bottoken-a/sendMessage');
		expect(calls[0]?.init.method).toBe('POST');
		expect(calls[0]?.init.redirect).toBe('error');
		expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ chat_id: 100, text: 'hello' });
	});

	test('aborts a never-settling sendMessage at its request bound', async () => {
		const calls: CapturedRequest[] = [];
		const server = serveNeverSettling();
		try {
			const client = createTelegramClient('token-a', {
				fetchImpl(url, init): Promise<Response> {
					calls.push({ init, url });
					return fetch(`http://127.0.0.1:${server.port}`, init);
				},
				requestTimeoutMs: 100,
			});

			await expect(client.sendMessage(100, 'hello')).rejects.toThrow();
			expect(calls[0]?.init.signal?.aborted).toBe(true);
		} finally {
			await server.stop(true);
		}
	});

	test('aborts a never-settling long poll at its server timeout plus grace bound', async () => {
		const calls: CapturedRequest[] = [];
		const server = serveNeverSettling();
		const fetchImpl = (url: string, init: RequestInit): Promise<Response> => {
			calls.push({ init, url });
			return fetch(`http://127.0.0.1:${server.port}`, init);
		};
		try {
			const timedClient = createTelegramClient('token-a', {
				fetchImpl,
				longPollGraceMs: 100,
			});
			await expect(timedClient.getUpdates(0, 0)).rejects.toThrow();
			expect(calls[0]?.init.signal?.aborted).toBe(true);
			expect(calls[0]?.init.redirect).toBe('error');
		} finally {
			await server.stop(true);
		}
	});

	test('combines caller cancellation with the long-poll bound', async () => {
		const calls: CapturedRequest[] = [];
		const cancelledClient = createTelegramClient('token-a', {
			fetchImpl(url, init): Promise<Response> {
				calls.push({ init, url });
				const signal = init.signal;
				if (!signal) return Promise.reject(new Error('missing abort signal'));
				return new Promise<Response>((_resolve, reject) => {
					signal.addEventListener(
						'abort',
						() => reject(signal.reason ?? new Error('aborted')),
						{ once: true },
					);
				});
			},
			longPollGraceMs: 1000,
		});
		const controller = new AbortController();
		const pending = cancelledClient.getUpdates(0, 30, controller.signal);
		controller.abort(new Error('shutdown'));

		await expect(pending).rejects.toThrow('shutdown');
		expect(calls[0]?.init.signal).not.toBe(controller.signal);
		expect(calls[0]?.init.signal?.aborted).toBe(true);
		expect(calls[0]?.init.redirect).toBe('error');
	});
});
