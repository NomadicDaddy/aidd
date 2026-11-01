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

// Zhipu's exhausted quota (HTTP 429, code 1310) names its reset with no time zone: "Your limit will
// reset at 2026-10-27 17:02:08". The clock is UTC+8. In logs/ai-calls.jsonl that reset's failures
// ran to 09:00:06Z and calls succeeded again from 09:02:35Z, and 17:02:08 at UTC+8 is 09:02:08Z.
// That one measurement is the only evidence, so the rule holds for this provider's own envelope:
// another provider's zone-less date stays unparsed and takes the fallback backoff.
const datedResetPattern =
	/^zhipu request failed: HTTP 429 .*"code":"1310".*limit will reset at (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/;
const datedResetUtcOffset = '+08:00';

function parseDatedReset(message: string): Date | undefined {
	const match = datedResetPattern.exec(message);
	if (!match) return undefined;
	const reset = new Date(`${match[1]}T${match[2]}${datedResetUtcOffset}`);
	return Number.isNaN(reset.getTime()) ? undefined : reset;
}

export function parseRateLimitReset(message: string, now: Date = new Date()): Date | undefined {
	const dated = parseDatedReset(message);
	if (dated) return dated;
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
