import type { AiddApiClient } from '../channels/apiClient.ts';

/**
 * Telegram <-> Director chat bridge.
 *
 * Outbound only: the bridge long-polls Telegram's getUpdates and forwards allowed
 * messages to the Director chat API, then sends the reply back. Director chat
 * only persists context (it never launches runs), so the bridge is chat-safe by
 * construction. No inbound exposure of aidd is required.
 */

const TELEGRAM_MESSAGE_LIMIT = 4096;
const POLL_TIMEOUT_SECONDS = 30;
const POLL_BACKOFF_MS = 3000;

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
		signal?: AbortSignal
	): Promise<TelegramUpdate[]>;
	sendMessage(chatId: number, text: string): Promise<void>;
}

interface TelegramApiResponse<T> {
	description?: string;
	ok: boolean;
	result?: T;
}

export function createTelegramClient(botToken: string): TelegramClient {
	const base = `https://api.telegram.org/bot${botToken}`;

	async function call<T>(method: string, body: unknown, signal?: AbortSignal): Promise<T> {
		const init: RequestInit = {
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		};
		if (signal) init.signal = signal;
		const response = await fetch(`${base}/${method}`, init);
		const data = (await response.json()) as TelegramApiResponse<T>;
		if (!data.ok) {
			throw new Error(
				`Telegram ${method} failed: ${data.description ?? response.statusText}`
			);
		}
		return data.result as T;
	}

	return {
		async getUpdates(offset, timeoutSeconds, signal) {
			// Bound the long-poll a little past the server-side timeout so a wedged
			// socket cannot hang the loop, while still honoring shutdown.
			const timeoutSignal = AbortSignal.timeout((timeoutSeconds + 10) * 1000);
			const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
			return await call<TelegramUpdate[]>(
				'getUpdates',
				{ allowed_updates: ['message'], offset, timeout: timeoutSeconds },
				combined
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
			{ title: `Telegram ${chatId}` }
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
					result.messages.assistant.content || '(no reply)'
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
				`aidd Telegram bridge: getUpdates failed: ${err instanceof Error ? err.message : String(err)}`
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
					`aidd Telegram bridge: handler err: ${err instanceof Error ? err.message : String(err)}`
				);
			}
		}
	}
}
