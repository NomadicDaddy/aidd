import { describe, expect, test } from 'bun:test';
import {
	computeRateLimitSleep,
	extractRateLimitMessage,
	extractRateLimitResetAt,
	parseRateLimitReset,
} from '../../cli/src/backends/rate-limit.ts';
import type { AgentEvent } from 'aidd-shared/backends/types';

describe('parseRateLimitReset', () => {
	const now = new Date('2026-05-05T03:00:00');

	test("parses 'resets 2am' as today when still in future", () => {
		const earlier = new Date('2026-05-05T01:00:00');
		const reset = parseRateLimitReset(
			'hit your rate limit, resets 2am (America/Chicago)',
			earlier,
		);
		expect(reset?.toISOString().slice(0, 16)).toBe(
			new Date('2026-05-05T02:00:00').toISOString().slice(0, 16),
		);
	});

	test("rolls 'resets 2am' to tomorrow when already past", () => {
		const reset = parseRateLimitReset('rate limit, resets 2am', now);
		expect(reset?.getDate()).toBe(6);
		expect(reset?.getHours()).toBe(2);
	});

	test("parses 'try again at 5:19 AM' (Codex format)", () => {
		const reset = parseRateLimitReset('Please try again at 5:19 AM tomorrow', now);
		expect(reset?.getHours()).toBe(5);
		expect(reset?.getMinutes()).toBe(19);
	});

	test('handles 12pm as noon', () => {
		const earlier = new Date('2026-05-05T08:00:00');
		const reset = parseRateLimitReset('resets 12pm', earlier);
		expect(reset?.getHours()).toBe(12);
	});

	test('handles 12am as midnight (next day from afternoon)', () => {
		const afternoon = new Date('2026-05-05T15:00:00');
		const reset = parseRateLimitReset('resets 12am', afternoon);
		expect(reset?.getHours()).toBe(0);
		expect(reset?.getDate()).toBe(6);
	});

	test('returns undefined for unparseable messages', () => {
		expect(parseRateLimitReset('rate limited but no time given')).toBeUndefined();
		expect(parseRateLimitReset('resets at sundown')).toBeUndefined();
	});
});

describe('computeRateLimitSleep', () => {
	test('computes sleep until reset + buffer', () => {
		const now = new Date('2026-05-05T01:00:00');
		const decision = computeRateLimitSleep('resets 2am', now, 60, 300);
		expect(decision.reason).toBe('until_reset');
		expect(decision.sleepMs).toBe(60 * 60 * 1000 + 60 * 1000);
	});

	test('falls back when message missing', () => {
		const decision = computeRateLimitSleep(undefined, new Date(), 60, 300);
		expect(decision.reason).toBe('fallback');
		expect(decision.sleepMs).toBe(300 * 1000);
	});

	test('falls back when message unparseable', () => {
		const decision = computeRateLimitSleep('just rate limited', new Date(), 60, 300);
		expect(decision.reason).toBe('fallback');
	});
});

describe('extractRateLimitMessage', () => {
	test('returns string raw from rate_limit event', () => {
		const events: AgentEvent[] = [{ type: 'rate_limit', raw: 'resets 2am' }];
		expect(extractRateLimitMessage(events)).toBe('resets 2am');
	});

	test('returns string meta from error event', () => {
		const events: AgentEvent[] = [
			{ type: 'error', reason: 'rate_limit', meta: 'try again at 5 AM' },
		];
		expect(extractRateLimitMessage(events)).toBe('try again at 5 AM');
	});

	test('serializes object raw', () => {
		const events: AgentEvent[] = [{ type: 'rate_limit', raw: { msg: 'resets 3am' } }];
		expect(extractRateLimitMessage(events)).toContain('resets 3am');
	});

	test('returns undefined when no rate-limit events', () => {
		const events: AgentEvent[] = [{ type: 'assistant_text', chunk: 'hi' }];
		expect(extractRateLimitMessage(events)).toBeUndefined();
	});
});

describe('extractRateLimitResetAt', () => {
	test('returns the structured resetAt from a rate_limit event', () => {
		const iso = new Date(1783550400 * 1000).toISOString();
		const events: AgentEvent[] = [{ type: 'rate_limit', raw: {}, resetAt: iso }];
		expect(extractRateLimitResetAt(events)?.toISOString()).toBe(iso);
	});

	test('ignores events without a parseable resetAt', () => {
		const events: AgentEvent[] = [
			{ type: 'rate_limit', raw: 'resets 2am' },
			{ type: 'rate_limit', raw: {}, resetAt: 'not-a-date' },
		];
		expect(extractRateLimitResetAt(events)).toBeUndefined();
	});
});

describe('computeRateLimitSleep with structured resetAt', () => {
	const now = new Date('2026-05-05T03:00:00Z');

	test('prefers the structured reset over message parsing', () => {
		const structured = new Date('2026-05-05T04:00:00Z');
		const decision = computeRateLimitSleep('resets 9pm', now, 60, 300, structured);
		expect(decision.reason).toBe('until_reset');
		expect(decision.resetAt).toEqual(structured);
		expect(decision.sleepMs).toBe(60 * 60 * 1000 + 60 * 1000);
	});

	test('a structured reset in the past retries immediately', () => {
		const structured = new Date('2026-05-05T01:00:00Z');
		const decision = computeRateLimitSleep(undefined, now, 60, 300, structured);
		expect(decision.reason).toBe('passed');
		expect(decision.sleepMs).toBe(0);
	});
});
