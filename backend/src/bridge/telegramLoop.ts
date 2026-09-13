import type { BridgeLoopDeps, TelegramUpdate } from './telegram.ts';

import { webLogger } from '../logger.ts';
import { TelegramApiError, waitForTelegramRetry } from './telegramRetry.ts';

const POLL_TIMEOUT_SECONDS = 30;
const POLL_BACKOFF_MS = 3000;

/**
 * Long-poll Telegram and dispatch each update until the signal aborts.
 *
 * Director turns can last minutes. The loop keeps getUpdates moving so one chat
 * cannot stall every other allow-listed chat; messages from the same chat still
 * run one at a time. Shutdown skips remaining queued updates and waits for
 * in-flight handlers to notice the abort.
 */
export async function runBridgeLoop(deps: BridgeLoopDeps): Promise<void> {
	let offset = 0;
	let failures = 0;
	const logger = deps.logger ?? webLogger;
	const inflight = new Set<Promise<void>>();
	const tailByChat = new Map<number, Promise<void>>();

	const enqueue = (update: TelegramUpdate): void => {
		const chatId = update.message?.chat.id;
		const previous = chatId === undefined ? undefined : tailByChat.get(chatId);
		const start = (): Promise<void> =>
			deps.handler.handleUpdate(update).catch((err: unknown) => {
				if (!deps.signal.aborted)
					logger.error(
						{ err, updateId: update.update_id },
						'Telegram update handling failed',
					);
			});
		// Start immediately when this chat is idle so a synchronous shutdown abort
		// is visible before the rest of the getUpdates batch is dispatched.
		const task = previous ? previous.catch(() => {}).then(start) : start();
		if (chatId !== undefined) tailByChat.set(chatId, task);
		inflight.add(task);
		void task.finally(() => {
			inflight.delete(task);
			if (chatId !== undefined && tailByChat.get(chatId) === task) tailByChat.delete(chatId);
		});
	};

	try {
		while (!deps.signal.aborted) {
			let updates: TelegramUpdate[];
			try {
				updates = await deps.telegram.getUpdates(offset, POLL_TIMEOUT_SECONDS, deps.signal);
			} catch (err) {
				if (deps.signal.aborted) break;
				failures++;
				const retryAfterMs = Math.max(
					POLL_BACKOFF_MS,
					err instanceof TelegramApiError ? (err.retryAfterMs ?? 0) : 0,
				);
				logger.warn(
					{ err, failures, retryAfterMs },
					'Telegram polling failed; waiting to retry',
				);
				await waitForTelegramRetry(retryAfterMs, deps.signal);
				continue;
			}
			if (failures > 0) logger.info({ failures }, 'Telegram polling recovered');
			failures = 0;
			for (const update of updates) {
				if (deps.signal.aborted) break;
				offset = update.update_id + 1;
				enqueue(update);
			}
		}
	} finally {
		await Promise.allSettled([...inflight]);
	}
}
