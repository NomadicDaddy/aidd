import type { ScheduledTask } from 'aidd-shared/contracts/scheduled-tasks';

import type { ScheduledTaskRepository } from './repository.ts';

import { webLogger } from '../../logger.ts';
import { nextOccurrence } from './recurrence.ts';

export const DIRECTOR_SYSTEM_KEY = 'director';
export const DIRECTOR_TASK_NAME = 'Director fleet cycle';

// An hourly cron repeats within the day, so only a factor of 24 keeps an even spacing across
// midnight. Everything else drifts: `0 */5 * * *` fires at 20:00 and again at 00:00, four hours
// later, which is not the cadence the operator asked for.
const HOUR_DIVISORS = [1, 2, 3, 4, 6, 8, 12, 24];

export interface DirectorCronConversion {
	expression: string;
	// Set when the requested interval could not be expressed exactly, so the caller can say what
	// it did rather than silently running on a different cadence.
	reason: null | string;
}

/**
 * Converts the `director.schedule.intervalHours` config setting into a cron expression.
 * @param intervalHours The configured interval, which may be any positive number.
 * @returns The cron expression, and the reason it differs from the request when it does.
 */
export function intervalHoursToCron(intervalHours: number): DirectorCronConversion {
	const requested = Math.max(1, Math.round(intervalHours));
	// `<=` over an ascending list breaks a tie toward the longer interval: 5 hours becomes 6, not 4.
	// Both are equally far from the request, and only one of them runs the cycle more often than the
	// operator asked for.
	const nearest = HOUR_DIVISORS.reduce((best, candidate) =>
		Math.abs(candidate - requested) <= Math.abs(best - requested) ? candidate : best,
	);
	// Every 24 hours is once a day. `0 */24 * * *` degenerates to hour zero anyway, so say so.
	const expression = nearest === 24 ? '0 0 * * *' : `0 */${nearest} * * *`;
	return {
		expression,
		reason:
			nearest === requested
				? null
				: `Every ${requested} hours does not divide the day evenly, so the cycle runs every ${nearest} hours instead.`,
	};
}

export interface DirectorScheduleSeed {
	enabled: boolean;
	intervalHours: number;
	timezone: string;
}

/**
 * Creates the built-in Director task the first time the panel starts with it missing.
 *
 * The row is the marker for "`director.schedule` has been read". Nothing deletes it — archiving is
 * refused by the service and by the schema, and this lookup filters on the system key rather than
 * on state — so `director.schedule` is consulted exactly once per install and an operator who
 * later edits the cadence, pauses, or resumes is never overwritten by a later boot.
 * @param repository The scheduled-task repository.
 * @param seed The Director schedule from config to seed from.
 * @returns The existing or newly created task.
 */
export async function ensureDirectorScheduledTask(
	repository: ScheduledTaskRepository,
	seed: DirectorScheduleSeed,
): Promise<ScheduledTask> {
	const existing = await repository.findBySystemKey(DIRECTOR_SYSTEM_KEY);
	if (existing) return existing;
	const { expression, reason } = intervalHoursToCron(seed.intervalHours);
	const now = Date.now();
	const schedule = { expression, kind: 'cron' as const, timezone: seed.timezone };
	const task = await repository.write(
		`scheduled_task_${crypto.randomUUID()}`,
		{
			name: DIRECTOR_TASK_NAME,
			projects: [],
			projectScope: 'none',
			schedule,
			target: { type: 'director' },
		},
		now,
		DIRECTOR_SYSTEM_KEY,
	);
	// A disabled schedule still gets a row: the task is how the Director's cadence is seen and
	// changed now, so it has to be visible on both surfaces even while it is not running.
	if (!seed.enabled) {
		await repository.setState(task.id, 'paused', null, now);
	}
	webLogger.info(
		{
			enabled: seed.enabled,
			expression,
			nextRunAt: seed.enabled ? nextOccurrence(schedule, now) : null,
			reason,
			taskId: task.id,
		},
		'Seeded the built-in Director scheduled task',
	);
	return (await repository.findBySystemKey(DIRECTOR_SYSTEM_KEY)) ?? task;
}
