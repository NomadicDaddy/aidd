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

/**
 * Fetch failures often embed the request URL, which includes the bot token.
 *
 * `DOMException` — what an aborted or timed-out fetch rejects with, and an `instanceof Error` in
 * Bun — exposes `message` as a getter with no setter, so assigning to it throws
 * "Attempted to assign to readonly property". Thrown from inside a redactor, that TypeError
 * replaced the diagnostic it was called to sanitize. Redact into a copy when the original cannot
 * be edited in place, keeping the `name` callers triage on (`AbortError`, `TimeoutError`).
 *
 * The copy deliberately carries no `cause`: the original still holds the unredacted URL, and
 * anything that walks a cause chain — the AI-call log flattens one into `errorCause` — would write
 * the bot token straight back out.
 */
export function redactTelegramUrlError(err: unknown): unknown {
	if (!(err instanceof Error)) return err;
	const message = hideTelegramBotUrl(err.message);
	const stack = typeof err.stack === 'string' ? hideTelegramBotUrl(err.stack) : undefined;
	try {
		err.message = message;
		if (stack !== undefined) err.stack = stack;
		return err;
	} catch {
		const copy = new Error(message);
		copy.name = err.name;
		if (stack !== undefined) copy.stack = stack;
		return copy;
	}
}

/** Cancellation resolves the wait; callers check the signal before attempting more work. */
export async function waitForTelegramRetry(ms: number, signal?: AbortSignal): Promise<void> {
	try {
		await setTimeout(ms, undefined, signal ? { signal } : {});
	} catch (err) {
		if (!signal?.aborted) throw err;
	}
}
