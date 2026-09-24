import { describe, expect, test } from 'bun:test';

import { createBridgeHandler, runBridgeLoop } from '../../backend/src/bridge/telegram.ts';
import {
	redactTelegramUrlError,
	TelegramApiError,
} from '../../backend/src/bridge/telegramRetry.ts';
import { createApiClient, DIRECTOR_CHAT_TIMEOUT_MS } from '../../backend/src/channels/apiClient.ts';

function captureLogs() {
	const events: Record<string, unknown>[] = [];
	const record = (fields: unknown, msg?: string): void => {
		events.push({ ...(fields as Record<string, unknown>), msg });
	};
	const logger = { error: record, info: record, warn: record };
	return { events, logger };
}

const update = {
	update_id: 7,
	message: { chat: { id: 100 }, message_id: 42, text: 'private request' },
};

describe('Telegram reply reliability', () => {
	test('waits beyond the normal API deadline and logs delivery without message content', async () => {
		const { events, logger } = captureLogs();
		const sent: string[] = [];
		const server = Bun.serve({
			hostname: '127.0.0.1',
			port: 0,
			async fetch(request) {
				if (new URL(request.url).pathname.endsWith('/messages')) {
					await Bun.sleep(100);
					return Response.json({ messages: { assistant: { content: 'private reply' } } });
				}
				return Response.json({ session: { id: 'session' } });
			},
		});
		try {
			if (!server.port) throw new Error('Expected a TCP port');
			const api = createApiClient({ port: server.port }, { requestTimeoutMs: 30 });
			await expect(api.post('/messages')).rejects.toThrow();
			const handler = createBridgeHandler({
				allowedChatIds: [100],
				api,
				logger,
				telegram: {
					async sendMessage(_chatId, text) {
						sent.push(text);
					},
				},
			});
			await handler.handleUpdate(update);
			expect(sent).toEqual(['private reply']);
			expect(events.map((event) => event.msg)).toEqual([
				'Telegram message received',
				'Telegram reply delivered',
			]);
			expect(events[1]).toMatchObject({
				chatId: 100,
				messageId: 42,
				updateId: 7,
				sessionId: 'session',
			});
			expect(events[1]?.durationMs).toBeGreaterThanOrEqual(90);
			expect(JSON.stringify(events)).not.toContain('private');
		} finally {
			await server.stop(true);
		}
	});

	test('cancels an in-flight Director request without sending a shutdown error', async () => {
		const controller = new AbortController();
		const { events, logger } = captureLogs();
		let sends = 0;
		const server = Bun.serve({
			hostname: '127.0.0.1',
			port: 0,
			fetch(request) {
				if (new URL(request.url).pathname.endsWith('/messages')) {
					controller.abort();
					return new Promise<Response>(() => {});
				}
				return Response.json({ session: { id: 'session' } });
			},
		});
		try {
			if (!server.port) throw new Error('Expected a TCP port');
			const handler = createBridgeHandler({
				allowedChatIds: [100],
				api: createApiClient({ port: server.port }),
				logger,
				signal: controller.signal,
				telegram: {
					async sendMessage() {
						sends++;
					},
				},
			});
			await handler.handleUpdate(update);
			expect(sends).toBe(0);
			expect(events.at(-1)?.msg).toBe('Telegram message interrupted by bridge shutdown');
		} finally {
			await server.stop(true);
		}
	});

	test('keeps an explicit request deadline finite even when a caller signal stays open', async () => {
		const controller = new AbortController();
		const server = Bun.serve({
			hostname: '127.0.0.1',
			port: 0,
			fetch: () => new Promise<Response>(() => {}),
		});
		try {
			if (!server.port) throw new Error('Expected a TCP port');
			const api = createApiClient({ port: server.port });
			await expect(
				api.post(
					'/messages',
					{},
					{
						signal: controller.signal,
						timeoutMs: 50,
					},
				),
			).rejects.toThrow();
			expect(controller.signal.aborted).toBe(false);
		} finally {
			controller.abort();
			await server.stop(true);
		}
	});

	test('Director message posts use a 30-minute deadline, not the ordinary channel timeout', async () => {
		const timeouts: number[] = [];
		const handler = createBridgeHandler({
			allowedChatIds: [100],
			logger: captureLogs().logger,
			api: {
				baseUrl: 'http://127.0.0.1:3210',
				async get<T>(): Promise<T> {
					throw new Error('unexpected GET');
				},
				async post<T>(
					path: string,
					_body?: unknown,
					options?: { timeoutMs?: number },
				): Promise<T> {
					if (options?.timeoutMs !== undefined) timeouts.push(options.timeoutMs);
					return (
						path.endsWith('/messages')
							? { messages: { assistant: { content: 'ok' } } }
							: { session: { id: 'session' } }
					) as T;
				},
			},
			telegram: { async sendMessage() {} },
		});
		await handler.handleUpdate(update);
		expect(timeouts).toEqual([DIRECTOR_CHAT_TIMEOUT_MS]);
		expect(DIRECTOR_CHAT_TIMEOUT_MS).toBe(30 * 60_000);
	});

	test('logs failed delivery once without repeating Director work or sending another message', async () => {
		const { events, logger } = captureLogs();
		let posts = 0;
		let sends = 0;
		const handler = createBridgeHandler({
			allowedChatIds: [100],
			logger,
			api: {
				baseUrl: 'http://127.0.0.1:3210',
				async get<T>(): Promise<T> {
					throw new Error('unexpected GET');
				},
				async post<T>(path: string): Promise<T> {
					posts++;
					return (
						path.endsWith('/messages')
							? { messages: { assistant: { content: 'reply' } } }
							: { session: { id: 'session' } }
					) as T;
				},
			},
			telegram: {
				async sendMessage() {
					sends++;
					throw new Error('socket timeout');
				},
			},
		});
		await handler.handleUpdate(update);
		expect(posts).toBe(2);
		expect(sends).toBe(1);
		expect(events.at(-1)).toMatchObject({ msg: 'Telegram message failed', phase: 'delivery' });
	});
});

describe('Telegram polling reliability', () => {
	test('does not dispatch more queued messages after shutdown', async () => {
		const controller = new AbortController();
		const handled: number[] = [];
		await runBridgeLoop({
			logger: captureLogs().logger,
			signal: controller.signal,
			handler: {
				async handleUpdate(item) {
					handled.push(item.update_id);
					controller.abort();
				},
			},
			telegram: {
				async getUpdates() {
					return [update, { ...update, update_id: 8 }];
				},
				async sendMessage() {},
			},
		});
		expect(handled).toEqual([7]);
	});
	test('honors retry_after and logs recovery on the next successful poll', async () => {
		const { events, logger } = captureLogs();
		const controller = new AbortController();
		const polledAt: number[] = [];
		const offsets: number[] = [];
		try {
			await runBridgeLoop({
				logger,
				signal: controller.signal,
				handler: { async handleUpdate() {} },
				telegram: {
					async getUpdates(offset) {
						polledAt.push(performance.now());
						offsets.push(offset);
						if (polledAt.length === 1)
							throw new TelegramApiError('getUpdates', 'retry after 5', 429, 5);
						if (polledAt.length === 2) return [update];
						controller.abort();
						return [];
					},
					async sendMessage() {},
				},
			});
			expect((polledAt[1] ?? 0) - (polledAt[0] ?? 0)).toBeGreaterThanOrEqual(4950);
			expect(offsets).toEqual([0, 0, 8]);
			expect(events[0]).toMatchObject({ retryAfterMs: 5000, failures: 1 });
			expect(events[1]?.msg).toBe('Telegram polling recovered');
		} finally {
			controller.abort();
		}
	}, 8000);

	test('keeps polling while another chat is in a Director turn', async () => {
		const controller = new AbortController();
		let release!: () => void;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const handled: number[] = [];
		let polls = 0;
		await runBridgeLoop({
			logger: captureLogs().logger,
			signal: controller.signal,
			handler: {
				async handleUpdate(item) {
					handled.push(item.update_id);
					if (item.update_id === 7) await blocked;
				},
			},
			telegram: {
				async getUpdates() {
					polls++;
					if (polls === 1)
						return [
							update,
							{
								...update,
								update_id: 8,
								message: { chat: { id: 200 }, message_id: 43, text: 'other' },
							},
						];
					expect(handled).toEqual([7, 8]);
					release();
					controller.abort();
					return [];
				},
				async sendMessage() {},
			},
		});
		expect(polls).toBeGreaterThanOrEqual(2);
	});

	test('serializes two messages from the same chat', async () => {
		const controller = new AbortController();
		const order: string[] = [];
		let releaseFirst!: () => void;
		const firstHold = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		let polls = 0;
		await runBridgeLoop({
			logger: captureLogs().logger,
			signal: controller.signal,
			handler: {
				async handleUpdate(item) {
					order.push(`start-${item.update_id}`);
					if (item.update_id === 7) await firstHold;
					order.push(`end-${item.update_id}`);
				},
			},
			telegram: {
				async getUpdates() {
					polls++;
					if (polls === 1) return [update, { ...update, update_id: 8 }];
					expect(order).toEqual(['start-7']);
					releaseFirst();
					const started = performance.now();
					while (!order.includes('end-8')) {
						if (performance.now() - started > 1000)
							throw new Error('same-chat drain timed out');
						await Bun.sleep(5);
					}
					controller.abort();
					return [];
				},
				async sendMessage() {},
			},
		});
		expect(order).toEqual(['start-7', 'end-7', 'start-8', 'end-8']);
	});

	test('awaits in-flight handlers after shutdown abort', async () => {
		const controller = new AbortController();
		let finished = false;
		let markStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		let polls = 0;
		await runBridgeLoop({
			logger: captureLogs().logger,
			signal: controller.signal,
			handler: {
				async handleUpdate() {
					markStarted();
					await new Promise<void>((resolve) => {
						controller.signal.addEventListener('abort', () => resolve(), {
							once: true,
						});
					});
					finished = true;
				},
			},
			telegram: {
				async getUpdates() {
					polls++;
					if (polls === 1) return [update];
					await started;
					controller.abort();
					return [];
				},
				async sendMessage() {},
			},
		});
		expect(finished).toBe(true);
	});

	test('stops during rate-limit backoff without another poll', async () => {
		const controller = new AbortController();
		const { logger } = captureLogs();
		let polls = 0;
		const timer = setTimeout(() => controller.abort(), 50);
		try {
			await runBridgeLoop({
				logger,
				signal: controller.signal,
				handler: { async handleUpdate() {} },
				telegram: {
					async getUpdates() {
						polls++;
						throw new TelegramApiError('getUpdates', 'limited', 429, 60);
					},
					async sendMessage() {},
				},
			});
			expect(polls).toBe(1);
		} finally {
			clearTimeout(timer);
			controller.abort();
		}
	});
});

describe('Telegram error redaction', () => {
	test('hides the bot token in an editable error', () => {
		const err = new Error('fetch to api.telegram.org/bot12345:SECRET/getUpdates failed');
		const redacted = redactTelegramUrlError(err);
		expect(redacted).toBe(err);
		expect((redacted as Error).message).toBe(
			'fetch to api.telegram.org/bot[REDACTED]/getUpdates failed',
		);
	});

	// An aborted or timed-out fetch rejects with a DOMException, whose `message` is a getter with
	// no setter: assigning to it threw and the TypeError replaced the diagnostic entirely.
	test.each(['AbortError', 'TimeoutError'])('redacts a %s without throwing', (name) => {
		const err = new DOMException(
			'Unable to reach api.telegram.org/bot12345:SECRET/getUpdates',
			name,
		);
		const redacted = redactTelegramUrlError(err);
		expect(redacted).toBeInstanceOf(Error);
		expect((redacted as Error).name).toBe(name);
		expect((redacted as Error).message).toBe(
			'Unable to reach api.telegram.org/bot[REDACTED]/getUpdates',
		);
		expect((redacted as Error).message).not.toContain('SECRET');
		// No cause: the original still holds the unredacted URL, and anything that walks a
		// cause chain would write the bot token back out.
		expect((redacted as Error).cause).toBeUndefined();
	});

	test('passes a non-Error rejection through untouched', () => {
		expect(redactTelegramUrlError('plain string')).toBe('plain string');
	});
});
