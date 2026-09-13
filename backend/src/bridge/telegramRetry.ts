import { setTimeout } from 'node:timers/promises';

const MAX_RETRY_AFTER_MS = 2_147_483_647;

function hideTelegramBotUrl(text: string): string {
	return text.replace(/api\.telegram\.org\/bot[^\s/"'\\]+/gi, 'api.telegram.org/bot[REDACTED]');
}

function isFloodWait(status: number, errorCode: unknown): boolean {
	return status === 429 || errorCode === 429;
}

function retryAfterMs(status: number, retryAfter: unknown, errorCode: unknown): null | number {
	if (!isFloodWait(status, errorCode)) return null;
	if (typeof retryAfter !== 'number' || !Number.isSafeInteger(retryAfter) || retryAfter <= 0)
		return null;
	const ms = retryAfter * 1000;
	return ms <= MAX_RETRY_AFTER_MS ? ms : null;
}

export class TelegramApiError extends Error {
	readonly retryAfterMs: null | number;
	readonly status: number;

	constructor(
		method: string,
		description: string,
		status: number,
		retryAfter?: unknown,
		errorCode?: unknown,
	) {
		super(`Telegram ${method} failed: ${description}`);
		this.name = 'TelegramApiError';
		this.status = status;
		this.retryAfterMs = retryAfterMs(status, retryAfter, errorCode);
	}
}

/** Fetch failures often embed the request URL, which includes the bot token. */
export function redactTelegramUrlError(err: unknown): unknown {
	if (!(err instanceof Error)) return err;
	err.message = hideTelegramBotUrl(err.message);
	if (typeof err.stack === 'string') err.stack = hideTelegramBotUrl(err.stack);
	return err;
}

/** Cancellation resolves the wait; callers check the signal before attempting more work. */
export async function waitForTelegramRetry(ms: number, signal?: AbortSignal): Promise<void> {
	try {
		await setTimeout(ms, undefined, signal ? { signal } : {});
	} catch (err) {
		if (!signal?.aborted) throw err;
	}
}
