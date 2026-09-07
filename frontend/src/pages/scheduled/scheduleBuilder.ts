import type { ScheduledTaskSchedule } from 'aidd-shared/contracts/scheduled-tasks';

export type ScheduleBuilder = 'advanced' | 'daily' | 'once' | 'weekly';

export interface ScheduleFormState {
	builder: ScheduleBuilder;
	cron: string;
	runAt: string;
	time: string;
	timezone: string;
	weekdays: string[];
}

/** Which field is unfilled, so the form can put the message on that field rather than in a toast. */
export interface ScheduleIssue {
	field: 'cron' | 'runAt' | 'time' | 'weekdays';
	message: string;
}

const TIME_VALUE = /^\d{1,2}:\d{2}/;

const DAILY_EXPRESSION = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;
const WEEKLY_EXPRESSION = /^(\d{1,2}) (\d{1,2}) \* \* ([0-6](?:,[0-6])*)$/;

function expressionMatchesStructuredFields(input: {
	builder: ScheduleBuilder;
	cron: string;
	time: string;
	weekdays: string[];
}): boolean {
	if (input.builder === 'advanced' || input.builder === 'once') return false;
	const match =
		input.builder === 'daily'
			? DAILY_EXPRESSION.exec(input.cron)
			: WEEKLY_EXPRESSION.exec(input.cron);
	if (!match) return false;
	const expressionTime = `${match[2]!.padStart(2, '0')}:${match[1]!.padStart(2, '0')}`;
	return (
		expressionTime === input.time &&
		(input.builder === 'daily' || match[3] === input.weekdays.join(','))
	);
}

function zonedParts(timestamp: number, timezone: string): Record<string, string> {
	return Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			day: '2-digit',
			hour: '2-digit',
			hourCycle: 'h23',
			minute: '2-digit',
			month: '2-digit',
			timeZone: timezone,
			year: 'numeric',
		})
			.formatToParts(timestamp)
			.map((part) => [part.type, part.value]),
	);
}

function zonedLocalToIso(value: string, timezone: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
	if (!match) throw new Error('Invalid local date and time.');
	const desired = Date.UTC(
		Number(match[1]),
		Number(match[2]) - 1,
		Number(match[3]),
		Number(match[4]),
		Number(match[5]),
	);
	let instant = desired;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const parts = zonedParts(instant, timezone);
		const represented = Date.UTC(
			Number(parts.year),
			Number(parts.month) - 1,
			Number(parts.day),
			Number(parts.hour),
			Number(parts.minute),
		);
		instant += desired - represented;
	}
	const resolved = zonedParts(instant, timezone);
	const resolvedValue = `${resolved.year}-${resolved.month}-${resolved.day}T${resolved.hour}:${resolved.minute}`;
	if (resolvedValue !== value)
		throw new Error('That local time does not exist in this timezone.');
	return new Date(instant).toISOString();
}

export function scheduleFormState(schedule?: ScheduledTaskSchedule): ScheduleFormState {
	const timezone = schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
	if (!schedule) {
		return {
			builder: 'daily',
			cron: '0 9 * * *',
			runAt: '',
			time: '09:00',
			timezone,
			weekdays: ['1'],
		};
	}
	if (schedule.kind === 'once') {
		const parts = zonedParts(Date.parse(schedule.runAt), timezone);
		return {
			builder: 'once',
			cron: '0 9 * * *',
			runAt: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`,
			time: '09:00',
			timezone,
			weekdays: ['1'],
		};
	}
	const daily = DAILY_EXPRESSION.exec(schedule.expression);
	if (daily) {
		return {
			builder: 'daily',
			cron: schedule.expression,
			runAt: '',
			time: `${daily[2]!.padStart(2, '0')}:${daily[1]!.padStart(2, '0')}`,
			timezone,
			weekdays: ['1'],
		};
	}
	const weekly = WEEKLY_EXPRESSION.exec(schedule.expression);
	if (weekly) {
		return {
			builder: 'weekly',
			cron: schedule.expression,
			runAt: '',
			time: `${weekly[2]!.padStart(2, '0')}:${weekly[1]!.padStart(2, '0')}`,
			timezone,
			weekdays: weekly[3]!.split(','),
		};
	}
	return {
		builder: 'advanced',
		cron: schedule.expression,
		runAt: '',
		time: '09:00',
		timezone,
		weekdays: ['1'],
	};
}

/**
 * The reason the current fields cannot produce a schedule, or null when they can.
 *
 * The daily and weekly builders assemble a cron expression the operator never sees. An empty time
 * field or an empty weekday set assembled one anyway — `"00  * * *"` and `"30 09 * * "` — which the
 * backend rejected with "Cron expressions must contain exactly five fields.", a message about a
 * field this form does not show. Ask here first, and say what is actually missing.
 */
export function scheduleIssue(input: {
	builder: ScheduleBuilder;
	cron: string;
	runAt: string;
	time: string;
	weekdays: string[];
}): null | ScheduleIssue {
	if (input.builder === 'once')
		return input.runAt ? null : { field: 'runAt', message: 'Choose a date and time.' };
	if (input.builder === 'advanced')
		return input.cron.trim() ? null : { field: 'cron', message: 'Enter a cron expression.' };
	if (!TIME_VALUE.test(input.time)) return { field: 'time', message: 'Choose a time.' };
	if (input.builder === 'weekly' && input.weekdays.length === 0)
		return { field: 'weekdays', message: 'Select at least one weekday.' };
	return null;
}

export function buildSchedule(input: {
	builder: ScheduleBuilder;
	cron: string;
	runAt: string;
	time: string;
	timezone: string;
	weekdays: string[];
}): ScheduledTaskSchedule {
	// Never assemble a malformed expression: a caller that skipped the check gets the same sentence
	// the field would have shown, not a five-fields complaint from the backend.
	const issue = scheduleIssue(input);
	if (issue) throw new Error(issue.message);
	if (input.builder === 'once') {
		return {
			kind: 'once',
			runAt: zonedLocalToIso(input.runAt, input.timezone),
			timezone: input.timezone,
		};
	}
	if (input.builder === 'advanced') {
		return { expression: input.cron, kind: 'cron', timezone: input.timezone };
	}
	if (expressionMatchesStructuredFields(input)) {
		return { expression: input.cron, kind: 'cron', timezone: input.timezone };
	}
	const [hour = '09', minute = '00'] = input.time.split(':');
	return {
		expression:
			input.builder === 'daily'
				? `${minute} ${hour} * * *`
				: `${minute} ${hour} * * ${input.weekdays.join(',')}`,
		kind: 'cron',
		timezone: input.timezone,
	};
}
