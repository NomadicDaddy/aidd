import type {
	ScheduledSchedulePreview,
	ScheduledTaskSchedule,
} from 'aidd-shared/contracts/scheduled-tasks';

import { Cron } from 'croner';

import { HttpError } from '../errors.ts';

const FIVE_FIELDS = /^\S+(?:\s+\S+){4}$/;

export function assertTimezone(timezone: string): void {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
	} catch {
		throw new HttpError(`Invalid IANA timezone: ${timezone}`, 400);
	}
}

export function validateSchedule(schedule: ScheduledTaskSchedule): void {
	assertTimezone(schedule.timezone);
	if (schedule.kind === 'once') {
		const timestamp = Date.parse(schedule.runAt);
		if (!Number.isFinite(timestamp)) throw new HttpError('Invalid one-time UTC instant.', 400);
		return;
	}
	if (!FIVE_FIELDS.test(schedule.expression.trim())) {
		throw new HttpError('Cron expressions must contain exactly five fields.', 400);
	}
	try {
		new Cron(schedule.expression, { paused: true, timezone: schedule.timezone });
	} catch (err) {
		throw new HttpError(err instanceof Error ? err.message : 'Invalid cron expression.', 400);
	}
}

export function previewSchedule(
	schedule: ScheduledTaskSchedule,
	from = new Date(),
): ScheduledSchedulePreview {
	validateSchedule(schedule);
	if (schedule.kind === 'once') {
		const timestamp = Date.parse(schedule.runAt);
		return { next: timestamp >= from.getTime() ? [timestamp] : [] };
	}
	const cron = new Cron(schedule.expression, { paused: true, timezone: schedule.timezone });
	return { next: cron.nextRuns(5, from).map((date) => date.getTime()) };
}

export function nextOccurrence(schedule: ScheduledTaskSchedule, after: number): null | number {
	validateSchedule(schedule);
	if (schedule.kind === 'once') {
		const runAt = Date.parse(schedule.runAt);
		return runAt > after ? runAt : null;
	}
	return (
		new Cron(schedule.expression, { paused: true, timezone: schedule.timezone })
			.nextRun(new Date(after))
			?.getTime() ?? null
	);
}
