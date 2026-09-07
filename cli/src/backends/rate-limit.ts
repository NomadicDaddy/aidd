import type { AgentEvent } from 'aidd-shared/backends/types';

// Structured reset time from a rate_limit event (claude-code rate_limit_event carries the
// reset epoch); preferred over regex-parsing "resets 5:40pm" out of message text.
export function extractRateLimitResetAt(events: AgentEvent[]): Date | undefined {
	for (const event of events) {
		if (event.type !== 'rate_limit' || typeof event.resetAt !== 'string') continue;
		const parsed = new Date(event.resetAt);
		if (!Number.isNaN(parsed.getTime())) return parsed;
	}
	return undefined;
}

export function extractRateLimitMessage(events: AgentEvent[]): string | undefined {
	for (const event of events) {
		if (event.type === 'rate_limit') {
			const raw = event.raw;
			if (typeof raw === 'string' && raw.length > 0) return raw;
			if (raw !== undefined) return JSON.stringify(raw);
		}
		if (event.type === 'error' && event.reason === 'rate_limit') {
			const meta = event.meta;
			if (typeof meta === 'string' && meta.length > 0) return meta;
			if (meta !== undefined) return JSON.stringify(meta);
		}
	}
	return undefined;
}

const resetTimePattern = /(?:resets|try again at)\s+(\d{1,2})(?::(\d{2}))?\s*([aApP][mM])/;

export function parseRateLimitReset(message: string, now: Date = new Date()): Date | undefined {
	const match = message.match(resetTimePattern);
	if (!match) return undefined;
	const hour = Number(match[1]);
	const minute = match[2] !== undefined ? Number(match[2]) : 0;
	const meridiem = (match[3] ?? '').toUpperCase();
	if (!Number.isFinite(hour) || hour < 1 || hour > 12) return undefined;
	if (!Number.isFinite(minute) || minute < 0 || minute > 59) return undefined;

	let hour24 = hour;
	if (meridiem === 'PM' && hour !== 12) hour24 = hour + 12;
	else if (meridiem === 'AM' && hour === 12) hour24 = 0;

	const target = new Date(now);
	target.setHours(hour24, minute, 0, 0);
	if (target.getTime() <= now.getTime()) {
		target.setDate(target.getDate() + 1);
	}
	return target;
}

export interface RateLimitSleepDecision {
	reason: 'fallback' | 'passed' | 'until_reset';
	resetAt?: Date;
	sleepMs: number;
}

export function computeRateLimitSleep(
	message: string | undefined,
	now: Date,
	bufferSeconds: number,
	fallbackSeconds: number,
	structuredResetAt?: Date,
): RateLimitSleepDecision {
	const reset = structuredResetAt ?? (message ? parseRateLimitReset(message, now) : undefined);
	if (!reset) {
		return { reason: 'fallback', sleepMs: fallbackSeconds * 1000 };
	}
	const sleepMs = reset.getTime() - now.getTime() + bufferSeconds * 1000;
	if (sleepMs <= 0) {
		return { reason: 'passed', resetAt: reset, sleepMs: 0 };
	}
	return { reason: 'until_reset', resetAt: reset, sleepMs };
}
