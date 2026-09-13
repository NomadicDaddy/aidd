import { assertSafeAgentBaseUrl } from 'aidd-shared';

import { type AiddApiClient, DIRECTOR_CHAT_TIMEOUT_MS } from '../channels/apiClient.ts';
import { webLogger } from '../logger.ts';
import { redactTelegramUrlError, TelegramApiError, waitForTelegramRetry } from './telegramRetry.ts';

export { runBridgeLoop } from './telegramLoop.ts';

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
const TELEGRAM_LONG_POLL_GRACE_MS = 10_000;
const TELEGRAM_REQUEST_TIMEOUT_MS = 15_000;
const MAX_SEND_RATE_LIMIT_RETRIES = 2;

type BridgeLogger = Pick<typeof webLogger, 'error' | 'info' | 'warn'>;

export interface TelegramTransportOptions {
	fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
	logger?: BridgeLogger;
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
	sendMessage(chatId: number, text: string, signal?: AbortSignal): Promise<void>;
}

interface TelegramApiResponse<T> {
	description?: string;
	error_code?: unknown;
	ok: boolean;
	parameters?: { retry_after?: unknown };
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
	const logger = options.logger ?? webLogger;

	async function call<T>(method: string, body: unknown, signal?: AbortSignal): Promise<T> {
		const requestUrl = `${base}/${method}`;
		assertSafeAgentBaseUrl(requestUrl, 'Telegram API request');
		try {
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
				throw new TelegramApiError(
					method,
					data.description ?? response.statusText,
					response.status,
					data.parameters?.retry_after,
					data.error_code,
				);
			}
			return data.result as T;
		} catch (err) {
			if (err instanceof TelegramApiError) throw err;
			throw redactTelegramUrlError(err);
		}
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
		async sendMessage(chatId, text, signal) {
			const clipped =
				text.length > TELEGRAM_MESSAGE_LIMIT ? text.slice(0, TELEGRAM_MESSAGE_LIMIT) : text;
			for (let attempt = 0; ; attempt++) {
				signal?.throwIfAborted();
				const timeout = AbortSignal.timeout(requestTimeoutMs);
				try {
					await call(
						'sendMessage',
						{
							chat_id: chatId,
							text: clipped.length > 0 ? clipped : '(no content)',
						},
						signal ? AbortSignal.any([signal, timeout]) : timeout,
					);
					return;
				} catch (err) {
					if (
						!(err instanceof TelegramApiError) ||
						err.retryAfterMs === null ||
						attempt >= MAX_SEND_RATE_LIMIT_RETRIES ||
						signal?.aborted
					)
						throw err;
					logger.warn(
						{ attempt: attempt + 1, chatId, retryAfterMs: err.retryAfterMs },
						'Telegram delivery rate limited; waiting to retry',
					);
					await waitForTelegramRetry(err.retryAfterMs, signal);
				}
			}
		},
	};
}

export interface BridgeHandlerDeps {
	allowedChatIds: number[];
	api: AiddApiClient;
	logger?: BridgeLogger;
	signal?: AbortSignal;
	telegram: Pick<TelegramClient, 'sendMessage'>;
}

export interface BridgeHandler {
	handleUpdate(update: TelegramUpdate): Promise<void>;
}

export function createBridgeHandler(deps: BridgeHandlerDeps): BridgeHandler {
	const sessionByChat = new Map<number, string>();
	const allowed = new Set(deps.allowedChatIds);
	const logger = deps.logger ?? webLogger;
	const requestOptions = deps.signal ? { signal: deps.signal } : {};

	async function ensureSession(chatId: number): Promise<string> {
		const existing = sessionByChat.get(chatId);
		if (existing) return existing;
		const created = await deps.api.post<{ session: { id: string } }>(
			'/api/v1/director/chat/sessions',
			{ title: `Telegram ${chatId}` },
			requestOptions,
		);
		sessionByChat.set(chatId, created.session.id);
		return created.session.id;
	}

	return {
		async handleUpdate(update) {
			if (deps.signal?.aborted) return;
			const message = update.message;
			const text = message?.text?.trim();
			if (!message || !text) return;
			const chatId = message.chat.id;
			// Allowlist: silently ignore anyone who is not an approved chat.
			if (!allowed.has(chatId)) return;
			const started = performance.now();
			const context = { chatId, messageId: message.message_id, updateId: update.update_id };
			logger.info(context, 'Telegram message received');
			let phase = 'director';
			try {
				const sessionId = await ensureSession(chatId);
				const result = await deps.api.post<{
					messages: { assistant: { content: string } };
				}>(
					`/api/v1/director/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
					{
						content: text,
					},
					{ ...requestOptions, timeoutMs: DIRECTOR_CHAT_TIMEOUT_MS },
				);
				deps.signal?.throwIfAborted();
				phase = 'delivery';
				await deps.telegram.sendMessage(
					chatId,
					result.messages.assistant.content || '(no reply)',
					deps.signal,
				);
				logger.info(
					{ ...context, durationMs: Math.round(performance.now() - started), sessionId },
					'Telegram reply delivered',
				);
			} catch (err) {
				if (deps.signal?.aborted) {
					logger.info(
						{ ...context, phase },
						'Telegram message interrupted by bridge shutdown',
					);
					return;
				}
				logger.error(
					{ ...context, durationMs: Math.round(performance.now() - started), err, phase },
					'Telegram message failed',
				);
				// A failed send may already have arrived. Do not send a second message or rerun Director.
				if (phase === 'delivery') return;
				const detail = err instanceof Error ? err.message : String(err);
				await deps.telegram.sendMessage(chatId, `⚠️ aidd error: ${detail}`, deps.signal);
				logger.info(context, 'Telegram error reply delivered');
			}
		},
	};
}

export interface BridgeLoopDeps {
	handler: BridgeHandler;
	logger?: BridgeLogger;
	signal: AbortSignal;
	telegram: TelegramClient;
}
