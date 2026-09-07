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
