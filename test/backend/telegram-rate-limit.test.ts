import { describe, expect, test } from 'bun:test';

import { createTelegramClient } from '../../backend/src/bridge/telegram.ts';
import { TelegramApiError } from '../../backend/src/bridge/telegramRetry.ts';
import { webLogger } from '../../backend/src/logger.ts';

const logger = webLogger.child({}, { level: 'silent' });

describe('Telegram rate-limit transport', () => {
	test('preserves Telegram retry_after and HTTP status for polling', async () => {
		const client = createTelegramClient('test-token', {
			fetchImpl: async () =>
				Response.json(
					{ ok: false, description: 'Too Many Requests', parameters: { retry_after: 5 } },
					{ status: 429 },
				),
		});
		await expect(client.getUpdates(0, 30)).rejects.toMatchObject({
			status: 429,
			retryAfterMs: 5000,
		});
	});

	test('rejects malformed and overflowing delays instead of creating immediate retry loops', () => {
		for (const retryAfter of [undefined, null, '5', -1, 0, 1.5, Infinity, 2_147_484]) {
			expect(
				new TelegramApiError('getUpdates', 'limited', 429, retryAfter).retryAfterMs,
			).toBeNull();
		}
		expect(new TelegramApiError('getUpdates', 'gateway', 502, 5).retryAfterMs).toBeNull();
		expect(new TelegramApiError('getUpdates', 'limited', 200, 5, 429).retryAfterMs).toBe(5000);
	});

	test('honors flood-wait retry_after when Telegram uses HTTP 200 and error_code 429', async () => {
		const client = createTelegramClient('test-token', {
			fetchImpl: async () =>
				Response.json({
					ok: false,
					error_code: 429,
					description: 'Too Many Requests',
					parameters: { retry_after: 5 },
				}),
		});
		await expect(client.getUpdates(0, 30)).rejects.toMatchObject({
			status: 200,
			retryAfterMs: 5000,
		});
	});

	test('strips bot tokens from fetch error messages', async () => {
		const client = createTelegramClient('secret-token', {
			async fetchImpl() {
				throw new Error(
					'Unable to connect to https://api.telegram.org/botsecret-token/sendMessage',
				);
			},
		});
		try {
			await client.sendMessage(100, 'reply');
			expect.unreachable();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			expect(message).toContain('api.telegram.org/bot[REDACTED]');
			expect(message).not.toContain('secret-token');
		}
	});

	test('retries a rate-limited delivery after the requested wait with the same body', async () => {
		const calls: { body: BodyInit | null | undefined; time: number }[] = [];
		const client = createTelegramClient('test-token', {
			logger,
			async fetchImpl(_url, init) {
				calls.push({ body: init.body, time: performance.now() });
				return calls.length === 1
					? Response.json({ ok: false, parameters: { retry_after: 1 } }, { status: 429 })
					: Response.json({ ok: true, result: true });
			},
		});
		await client.sendMessage(100, 'reply');
		expect(calls).toHaveLength(2);
		expect(calls[1]?.body).toBe(calls[0]?.body);
		expect((calls[1]?.time ?? 0) - (calls[0]?.time ?? 0)).toBeGreaterThanOrEqual(950);
	});

	test('bounds repeated rate-limit responses', async () => {
		let calls = 0;
		const client = createTelegramClient('test-token', {
			logger,
			async fetchImpl() {
				calls++;
				return Response.json(
					{ ok: false, parameters: { retry_after: 1 } },
					{ status: 429 },
				);
			},
		});
		await expect(client.sendMessage(100, 'reply')).rejects.toBeInstanceOf(TelegramApiError);
		expect(calls).toBe(3);
	});

	test('cancels delivery backoff without retrying', async () => {
		const controller = new AbortController();
		let calls = 0;
		const client = createTelegramClient('test-token', {
			logger,
			async fetchImpl() {
				calls++;
				return Response.json(
					{ ok: false, parameters: { retry_after: 60 } },
					{ status: 429 },
				);
			},
		});
		const timer = setTimeout(() => controller.abort(), 50);
		try {
			await expect(client.sendMessage(100, 'reply', controller.signal)).rejects.toThrow();
			expect(calls).toBe(1);
		} finally {
			clearTimeout(timer);
			controller.abort();
		}
	});

	test('does not retry an ambiguous network delivery failure', async () => {
		let calls = 0;
		const client = createTelegramClient('test-token', {
			async fetchImpl() {
				calls++;
				throw new Error('connection reset');
			},
		});
		await expect(client.sendMessage(100, 'reply')).rejects.toThrow('connection reset');
		expect(calls).toBe(1);
	});
});
