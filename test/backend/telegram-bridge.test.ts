import { describe, expect, test } from 'bun:test';
import type { ResolvedConfig, ResolvedTelegramBridgeConfig } from 'aidd-shared/config';
import type { AiddApiClient } from '../../backend/src/channels/apiClient.ts';
import {
	createBridgeHandler,
	type BridgeLoopDeps,
	type TelegramClient,
	type TelegramUpdate,
} from '../../backend/src/bridge/telegram.ts';
import { TelegramBridgeService } from '../../backend/src/services/telegramBridgeService.ts';

interface PostCall {
	path: string;
	body: unknown;
}

function fakeApi(responder: (path: string, body: unknown) => unknown): {
	client: AiddApiClient;
	posts: PostCall[];
} {
	const posts: PostCall[] = [];
	const client: AiddApiClient = {
		baseUrl: 'http://127.0.0.1:3210',
		get<T = unknown>(): Promise<T> {
			throw new Error('unexpected GET');
		},
		post<T = unknown>(path: string, body?: unknown): Promise<T> {
			posts.push({ path, body });
			return Promise.resolve(responder(path, body) as T);
		},
	};
	return { client, posts };
}

function fakeTelegram(): {
	sendMessage: (chatId: number, text: string) => Promise<void>;
	sent: { chatId: number; text: string }[];
} {
	const sent: { chatId: number; text: string }[] = [];
	return {
		sent,
		sendMessage(chatId: number, text: string): Promise<void> {
			sent.push({ chatId, text });
			return Promise.resolve();
		},
	};
}

function update(chatId: number, text: string | undefined, updateId = 1): TelegramUpdate {
	return {
		update_id: updateId,
		message: {
			message_id: updateId,
			chat: { id: chatId },
			...(text !== undefined ? { text } : {}),
		},
	};
}

function chatResponder(path: string): unknown {
	if (path === '/api/v1/director/chat/sessions') return { session: { id: 'sess-1' } };
	return { messages: { assistant: { content: 'hello from director' } } };
}

describe('Telegram bridge handler', () => {
	test('forwards an allowed message and replies with the Director answer', async () => {
		const { client, posts } = fakeApi(chatResponder);
		const telegram = fakeTelegram();
		const handler = createBridgeHandler({ api: client, telegram, allowedChatIds: [100] });

		await handler.handleUpdate(update(100, 'hi'));

		expect(posts[0]?.path).toBe('/api/v1/director/chat/sessions');
		expect(posts[1]?.path).toBe('/api/v1/director/chat/sessions/sess-1/messages');
		expect(posts[1]?.body).toEqual({ content: 'hi' });
		expect(telegram.sent).toEqual([{ chatId: 100, text: 'hello from director' }]);
	});

	test('ignores messages from chats not on the allowlist', async () => {
		const { client, posts } = fakeApi(chatResponder);
		const telegram = fakeTelegram();
		const handler = createBridgeHandler({ api: client, telegram, allowedChatIds: [100] });

		await handler.handleUpdate(update(999, 'hi'));

		expect(posts).toHaveLength(0);
		expect(telegram.sent).toHaveLength(0);
	});

	test('ignores updates with no text', async () => {
		const { client, posts } = fakeApi(chatResponder);
		const telegram = fakeTelegram();
		const handler = createBridgeHandler({ api: client, telegram, allowedChatIds: [100] });

		await handler.handleUpdate(update(100, undefined));
		await handler.handleUpdate(update(100, '   '));

		expect(posts).toHaveLength(0);
		expect(telegram.sent).toHaveLength(0);
	});

	test('reuses one chat session across messages from the same chat', async () => {
		const { client, posts } = fakeApi(chatResponder);
		const telegram = fakeTelegram();
		const handler = createBridgeHandler({ api: client, telegram, allowedChatIds: [100] });

		await handler.handleUpdate(update(100, 'one', 1));
		await handler.handleUpdate(update(100, 'two', 2));

		const sessionCreates = posts.filter(
			(call) => call.path === '/api/v1/director/chat/sessions'
		);
		expect(sessionCreates).toHaveLength(1);
		expect(telegram.sent).toHaveLength(2);
	});

	test('reports an API failure back to the user without throwing', async () => {
		const { client } = fakeApi(() => {
			throw new Error('backend down');
		});
		const telegram = fakeTelegram();
		const handler = createBridgeHandler({ api: client, telegram, allowedChatIds: [100] });

		await handler.handleUpdate(update(100, 'hi'));

		expect(telegram.sent).toHaveLength(1);
		expect(telegram.sent[0]?.chatId).toBe(100);
		expect(telegram.sent[0]?.text).toContain('aidd error');
		expect(telegram.sent[0]?.text).toContain('backend down');
	});
});

function makeConfig(telegram?: ResolvedTelegramBridgeConfig): ResolvedConfig {
	return {
		...(telegram ? { channels: { telegram } } : {}),
		cli: 'native',
		dirtyTreeThreshold: 50,
		idleNudgeTimeoutSeconds: 600,
		idleTimeoutSeconds: 900,
		maxConsecutiveTimeoutRetries: 2,
		maxIterations: null,
		noClean: false,
		noWorkBackoffMs: 30_000,
		quitOnAbort: 0,
		rateLimitBackoffSeconds: 300,
		rateLimitBufferSeconds: 60,
		reasoningEffort: 'low',
		timeoutSeconds: 3600,
		preflightDoctor: false,
		web: {
			allowedOrigins: [],
			allowedRoots: ['D:/applications'],
			allowRemote: false,
			dataDir: 'D:/applications/aidd/data',
			hostname: '127.0.0.1',
			ignoredFolders: ['.git', 'node_modules'],
			maxConcurrentRuns: 2,
			maxConcurrentRunsPerProject: 2,
			autoChainLimit: 3,
			autoChainRuns: false,
			useWorktrees: false,
			port: 3210,
			spernakitFleetManifest: null,
			spernakitInitScript: null,
			spernakitTemplateRef: null,
			showSpernakitProject: false,
			spernakitTemplateRepo: 'NomadicDaddy/spernakit',
			templates: [],
			traceDataMovement: false,
		},
	};
}

function makeServiceHarness() {
	const loops: BridgeLoopDeps[] = [];
	const stoppedSignals: AbortSignal[] = [];
	const apiClient: AiddApiClient = {
		baseUrl: 'http://127.0.0.1:3210',
		get<T = unknown>(): Promise<T> {
			throw new Error('unexpected GET');
		},
		post<T = unknown>(): Promise<T> {
			return Promise.resolve({ session: { id: 'sess-1' } } as T);
		},
	};
	const telegramClient: TelegramClient = {
		getUpdates(): Promise<TelegramUpdate[]> {
			return Promise.resolve([]);
		},
		sendMessage(): Promise<void> {
			return Promise.resolve();
		},
	};
	const service = new TelegramBridgeService({
		apiClientFactory: () => apiClient,
		logger: {
			error() {},
			info() {},
			warn() {},
		},
		runLoop(loopDeps) {
			loops.push(loopDeps);
			return new Promise<void>((resolve) => {
				loopDeps.signal.addEventListener(
					'abort',
					() => {
						stoppedSignals.push(loopDeps.signal);
						resolve();
					},
					{ once: true }
				);
			});
		},
		telegramClientFactory: () => telegramClient,
	});
	return { loops, service, stoppedSignals };
}

describe('Telegram bridge supervisor', () => {
	test('starts once when telegram config is present', async () => {
		const { loops, service } = makeServiceHarness();
		const config = makeConfig({ allowedChatIds: [100], botToken: 'token-a' });

		await service.updateConfig(config);
		await service.updateConfig(config);

		expect(loops).toHaveLength(1);
		await service.stop();
	});

	test('restarts when telegram config changes and stops when cleared', async () => {
		const { loops, service, stoppedSignals } = makeServiceHarness();

		await service.updateConfig(makeConfig({ allowedChatIds: [100], botToken: 'token-a' }));
		await service.updateConfig(makeConfig({ allowedChatIds: [200], botToken: 'token-a' }));
		await service.updateConfig(makeConfig());

		expect(loops).toHaveLength(2);
		expect(stoppedSignals).toHaveLength(2);
		expect(stoppedSignals.every((signal) => signal.aborted)).toBe(true);
	});

	test('does not start without telegram config', async () => {
		const { loops, service } = makeServiceHarness();

		await service.updateConfig(makeConfig());

		expect(loops).toHaveLength(0);
	});

	test('serializes concurrent config updates so only the last loop survives', async () => {
		const { loops, service } = makeServiceHarness();

		// Fire both updates without awaiting the first: unserialized, the calls
		// interleave at the stop await and leave two live pollers on one token.
		await Promise.all([
			service.updateConfig(makeConfig({ allowedChatIds: [100], botToken: 'token-a' })),
			service.updateConfig(makeConfig({ allowedChatIds: [200], botToken: 'token-b' })),
		]);

		expect(loops).toHaveLength(2);
		expect(loops[0]?.signal.aborted).toBe(true);
		expect(loops[1]?.signal.aborted).toBe(false);
		await service.stop();
		expect(loops[1]?.signal.aborted).toBe(true);
	});
});
