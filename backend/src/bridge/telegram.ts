import { assertSafeAgentBaseUrl } from 'aidd-shared';

import type { AiddApiClient } from '../channels/apiClient.ts';

/**
 * Telegram <-> Director chat bridge.
 *
 * Outbound only: the bridge long-polls Telegram's getUpdates and forwards allowed
 * messages to the Director chat API, then sends the reply back. No inbound
 * exposure of aidd is required.
 *
 * Not read-only. It posts to the same session endpoint the panel's Director chat
 * uses, which runs the chat agent, and that agent's unconditional tool set
 * includes launch_run, run_cycle, stop_run, and kill_run (see
 * chatAgentTools/definitions.ts — only the file tools are gated, on
 * `director.chat.allowFileEdits`). `allowedChatIds` is therefore the sole access
 * control on that capability: a leaked bot token plus an allowed chat id is fleet
 * control, not a chat transcript.
 */

const TELEGRAM_MESSAGE_LIMIT = 4096;
const POLL_TIMEOUT_SECONDS = 30;
const POLL_BACKOFF_MS = 3000;
const TELEGRAM_LONG_POLL_GRACE_MS = 10_000;
const TELEGRAM_REQUEST_TIMEOUT_MS = 15_000;

export interface TelegramTransportOptions {
	fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
	longPollGraceMs?: number;
	requestTimeoutMs?: number;
}

export interface TelegramMessage {
	chat: { id: number };
	from?: { id: number; username?: string };
	message_id: number;
	text?: string;
}

export interface TelegramUpdate {
	message?: TelegramMessage;
	update_id: number;
}

export interface TelegramClient {
	getUpdates(
		offset: number,
		timeoutSeconds: number,
		signal?: AbortSignal,
	): Promise<TelegramUpdate[]>;
	sendMessage(chatId: number, text: string): Promise<void>;
}

interface TelegramApiResponse<T> {
	description?: string;
	ok: boolean;
	result?: T;
}

export function createTelegramClient(
	botToken: string,
	options: TelegramTransportOptions = {},
): TelegramClient {
	const base = `https://api.telegram.org/bot${botToken}`;
	const fetchImpl = options.fetchImpl ?? fetch;
	const longPollGraceMs = options.longPollGraceMs ?? TELEGRAM_LONG_POLL_GRACE_MS;
	const requestTimeoutMs = options.requestTimeoutMs ?? TELEGRAM_REQUEST_TIMEOUT_MS;

	async function call<T>(method: string, body: unknown, signal?: AbortSignal): Promise<T> {
		const requestUrl = `${base}/${method}`;
		assertSafeAgentBaseUrl(requestUrl, 'Telegram API request');
		const init: RequestInit = {
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
			redirect: 'error',
			signal: signal ?? AbortSignal.timeout(requestTimeoutMs),
		};
		const response = await fetchImpl(requestUrl, init);
		const data = (await response.json()) as TelegramApiResponse<T>;
		if (!data.ok) {
			throw new Error(
				`Telegram ${method} failed: ${data.description ?? response.statusText}`,
			);
		}
		return data.result as T;
	}

	return {
		async getUpdates(offset, timeoutSeconds, signal) {
			// Bound the long-poll a little past the server-side timeout so a wedged
			// socket cannot hang the loop, while still honoring shutdown.
			const timeoutSignal = AbortSignal.timeout(timeoutSeconds * 1000 + longPollGraceMs);
			const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
			return await call<TelegramUpdate[]>(
				'getUpdates',
				{ allowed_updates: ['message'], offset, timeout: timeoutSeconds },
				combined,
			);
		},
		async sendMessage(chatId, text) {
			const clipped =
				text.length > TELEGRAM_MESSAGE_LIMIT ? text.slice(0, TELEGRAM_MESSAGE_LIMIT) : text;
			await call('sendMessage', {
				chat_id: chatId,
				text: clipped.length > 0 ? clipped : '(no content)',
			});
		},
	};
}

export interface BridgeHandlerDeps {
	allowedChatIds: number[];
	api: AiddApiClient;
	telegram: Pick<TelegramClient, 'sendMessage'>;
}

export interface BridgeHandler {
	handleUpdate(update: TelegramUpdate): Promise<void>;
}

export function createBridgeHandler(deps: BridgeHandlerDeps): BridgeHandler {
	const sessionByChat = new Map<number, string>();
	const allowed = new Set(deps.allowedChatIds);

	async function ensureSession(chatId: number): Promise<string> {
		const existing = sessionByChat.get(chatId);
		if (existing) return existing;
		const created = await deps.api.post<{ session: { id: string } }>(
			'/api/v1/director/chat/sessions',
			{ title: `Telegram ${chatId}` },
		);
		sessionByChat.set(chatId, created.session.id);
		return created.session.id;
	}

	return {
		async handleUpdate(update) {
			const message = update.message;
			const text = message?.text?.trim();
			if (!message || !text) return;
			const chatId = message.chat.id;
			// Allowlist: silently ignore anyone who is not an approved chat.
			if (!allowed.has(chatId)) return;
			try {
				const sessionId = await ensureSession(chatId);
				const result = await deps.api.post<{
					messages: { assistant: { content: string } };
				}>(`/api/v1/director/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
					content: text,
				});
				await deps.telegram.sendMessage(
					chatId,
					result.messages.assistant.content || '(no reply)',
				);
			} catch (err) {
				const detail = err instanceof Error ? err.message : String(err);
				await deps.telegram.sendMessage(chatId, `⚠️ aidd error: ${detail}`);
			}
		},
	};
}

export interface BridgeLoopDeps {
	handler: BridgeHandler;
	signal: AbortSignal;
	telegram: TelegramClient;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve();
			return;
		}
		const onAbort = () => {
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

/** Long-poll Telegram and dispatch each update until the signal aborts. */
export async function runBridgeLoop(deps: BridgeLoopDeps): Promise<void> {
	let offset = 0;
	while (!deps.signal.aborted) {
		let updates: TelegramUpdate[];
		try {
			updates = await deps.telegram.getUpdates(offset, POLL_TIMEOUT_SECONDS, deps.signal);
		} catch (err) {
			if (deps.signal.aborted) break;
			console.error(
				`aidd Telegram bridge: getUpdates failed: ${err instanceof Error ? err.message : String(err)}`,
			);
			await delay(POLL_BACKOFF_MS, deps.signal);
			continue;
		}
		for (const update of updates) {
			offset = update.update_id + 1;
			try {
				await deps.handler.handleUpdate(update);
			} catch (err) {
				console.error(
					`aidd Telegram bridge: handler err: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}
}
