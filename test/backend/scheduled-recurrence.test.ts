import { describe, expect, test } from 'bun:test';

import { HttpError } from '../../backend/src/services/errors.ts';
import {
	nextOccurrence,
	previewSchedule,
	validateSchedule,
} from '../../backend/src/services/scheduled/recurrence.ts';
import { schedulerDelayMs } from '../../backend/src/services/scheduled/runtime.ts';
import { buildSchedule } from '../../frontend/src/pages/scheduled/scheduleBuilder.ts';

describe('scheduled recurrence', () => {
	test('rejects seconds-bearing cron expressions and invalid timezones', () => {
		expect(() =>
			validateSchedule({ expression: '0 0 9 * * *', kind: 'cron', timezone: 'UTC' }),
		).toThrow(HttpError);
		expect(() =>
			validateSchedule({ expression: '0 9 * * *', kind: 'cron', timezone: 'Not/AZone' }),
		).toThrow(HttpError);
	});

	test('builds daily and selected-weekday expressions', () => {
		expect(
			buildSchedule({
				builder: 'daily',
				cron: '',
				runAt: '',
				time: '14:35',
				timezone: 'America/Chicago',
				weekdays: [],
			}),
		).toEqual({ expression: '35 14 * * *', kind: 'cron', timezone: 'America/Chicago' });
		expect(
			buildSchedule({
				builder: 'weekly',
				cron: '',
				runAt: '',
				time: '09:00',
				timezone: 'UTC',
				weekdays: ['1', '3', '5'],
			}),
		).toEqual({ expression: '00 09 * * 1,3,5', kind: 'cron', timezone: 'UTC' });
	});

	test('previews five timezone-aware occurrences across a DST boundary', () => {
		const preview = previewSchedule(
			{ expression: '30 2 * * *', kind: 'cron', timezone: 'America/Chicago' },
			new Date('2026-03-06T00:00:00.000Z'),
		);
		expect(preview.next).toHaveLength(5);
		expect(
			preview.next.every((value, index) => index === 0 || value > preview.next[index - 1]!),
		).toBe(true);
	});

	// croner 11's behaviour at the edges where it differs from 10, pinned to the exact instants.
	const chicago = (expression: string, from: string) =>
		previewSchedule(
			{ expression, kind: 'cron', timezone: 'America/Chicago' },
			new Date(from),
		).next.map((value) => new Date(value).toISOString());

	test('a daily 02:30 fires at 03:00 on the spring-forward night', () => {
		expect(chicago('30 2 * * *', '2027-03-13T12:00:00.000Z').slice(0, 2)).toEqual([
			'2027-03-14T08:00:00.000Z',
			'2027-03-15T07:30:00.000Z',
		]);
	});

	test('an hourly schedule fires through the repeated hour on the fall-back night', () => {
		expect(chicago('0 * * * *', '2026-11-01T05:30:00.000Z').slice(0, 3)).toEqual([
			'2026-11-01T06:00:00.000Z',
			'2026-11-01T07:00:00.000Z',
			'2026-11-01T08:00:00.000Z',
		]);
	});

	test('a daily 01:30 fires once on the fall-back night', () => {
		expect(chicago('30 1 * * *', '2026-11-01T05:00:00.000Z').slice(0, 2)).toEqual([
			'2026-11-01T06:30:00.000Z',
			'2026-11-02T07:30:00.000Z',
		]);
	});

	test('a ? day with a named weekday means that weekday', () => {
		expect(chicago('0 0 ? * MON', '2026-10-31T12:00:00.000Z').slice(0, 2)).toEqual([
			'2026-11-02T06:00:00.000Z',
			'2026-11-09T06:00:00.000Z',
		]);
	});

	test('handles one-time instants and clamps distant timer sleeps', () => {
		const future = Date.parse('2027-01-01T00:00:00.000Z');
		expect(
			nextOccurrence({ kind: 'once', runAt: '2027-01-01T00:00:00.000Z', timezone: 'UTC' }, 1),
		).toBe(future);
		expect(schedulerDelayMs(future, 1, false)).toBe(60 * 60 * 1_000);
		expect(schedulerDelayMs(future, 1, true)).toBe(15_000);
	});

	test('converts a one-time wall clock value in the selected timezone to UTC', () => {
		expect(
			buildSchedule({
				builder: 'once',
				cron: '',
				runAt: '2026-01-15T09:00',
				time: '',
				timezone: 'America/Chicago',
				weekdays: [],
			}),
		).toEqual({
			kind: 'once',
			runAt: '2026-01-15T15:00:00.000Z',
			timezone: 'America/Chicago',
		});
	});
});
