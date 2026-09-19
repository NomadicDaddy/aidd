import { Database } from 'bun:sqlite';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { WebDatabase, WebDatabaseHandle } from '../../backend/src/db/client.ts';
import type { ProjectService } from '../../backend/src/services/projectService.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { scheduledTasks } from '../../backend/src/db/schema.ts';
import {
	nextOccurrence,
	validateSchedule,
} from '../../backend/src/services/scheduled/recurrence.ts';
import { ScheduledTaskRepository } from '../../backend/src/services/scheduled/repository.ts';
import {
	DIRECTOR_SYSTEM_KEY,
	ensureDirectorScheduledTask,
	intervalHoursToCron,
} from '../../backend/src/services/scheduled/systemTasks.ts';
import { ScheduledTaskService } from '../../backend/src/services/scheduledTaskService.ts';

let db: WebDatabase;
let handle: WebDatabaseHandle;
let repository: ScheduledTaskRepository;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	const wrapped = wrapWebDatabase(sqlite);
	db = wrapped.db;
	handle = wrapped as unknown as WebDatabaseHandle;
	repository = new ScheduledTaskRepository(wrapped.db, wrapped.commands);
});

/** The service with only the collaborators a Director task ever reaches. */
function createService(): ScheduledTaskService {
	const projectService = {
		getAllowedRoots: () => ['D:/applications'],
		listProjects: async () => ({ projects: [] }),
		resolveProjectPath: async (path: string) => path,
	} as unknown as ProjectService;
	return new ScheduledTaskService(
		handle,
		projectService,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
	);
}

function seed(overrides: Partial<Parameters<typeof ensureDirectorScheduledTask>[1]> = {}) {
	return ensureDirectorScheduledTask(repository, {
		enabled: true,
		intervalHours: 12,
		timezone: 'UTC',
		...overrides,
	});
}

describe('interval to cron conversion', () => {
	test('keeps an interval that divides the day evenly', () => {
		expect(intervalHoursToCron(12)).toEqual({ expression: '0 */12 * * *', reason: null });
		expect(intervalHoursToCron(1)).toEqual({ expression: '0 */1 * * *', reason: null });
	});

	test('writes a daily interval as hour zero rather than a step of 24', () => {
		// `0 */24 * * *` is legal cron and means hour zero anyway, so the plain form says the same
		// thing without inviting the reader to work it out.
		expect(intervalHoursToCron(24)).toEqual({ expression: '0 0 * * *', reason: null });
	});

	test('rounds an interval that does not divide the day, and says so', () => {
		const five = intervalHoursToCron(5);
		expect(five.expression).toBe('0 */6 * * *');
		expect(five.reason).toContain('6 hours');
		// The operator needs to be told, not left to notice the cadence drifted on its own.
		expect(five.reason?.length ?? 0).toBeGreaterThan(0);
		// 5 sits exactly between 4 and 6, and the tie goes to the interval that runs the cycle less
		// often than requested rather than more.
		expect(intervalHoursToCron(10).expression).toBe('0 */12 * * *');
	});

	test('clamps intervals outside the range an hourly cron can express', () => {
		expect(intervalHoursToCron(0.25).expression).toBe('0 */1 * * *');
		expect(intervalHoursToCron(100).expression).toBe('0 0 * * *');
		expect(intervalHoursToCron(100).reason).not.toBeNull();
	});

	test('every conversion is a schedule the scheduler can actually run', () => {
		// A converted cadence goes straight into a task, so an expression this function can emit but
		// the validator rejects would be a boot failure with no way to fix it from the UI.
		const now = Date.UTC(2026, 0, 1, 3, 17);
		for (const hours of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 24, 30]) {
			const schedule = {
				expression: intervalHoursToCron(hours).expression,
				kind: 'cron' as const,
				timezone: 'UTC',
			};
			expect(() => validateSchedule(schedule)).not.toThrow();
			const next = nextOccurrence(schedule, now);
			expect(next).not.toBeNull();
			expect(next!).toBeGreaterThan(now);
		}
	});
});

describe('the built-in Director task', () => {
	test('creates one no-project task carrying the system marker', async () => {
		const task = await seed();
		expect(task.systemKey).toBe(DIRECTOR_SYSTEM_KEY);
		expect(task.projectScope).toBe('none');
		expect(task.projects).toEqual([]);
		expect(task.target).toEqual({ type: 'director' });
		expect(task.schedule).toEqual({
			expression: '0 */12 * * *',
			kind: 'cron',
			timezone: 'UTC',
		});
		expect(task.state).toBe('active');
		expect(task.nextRunAt).not.toBeNull();
	});

	test('seeds once and returns the same task on a later boot', async () => {
		const first = await seed();
		const second = await seed();
		expect(second.id).toBe(first.id);
		expect(await db.select().from(scheduledTasks)).toHaveLength(1);
	});

	test('creates a paused row rather than no row when the seeded schedule block is disabled', async () => {
		// The task is how the cadence is seen and changed now, so it has to exist on both surfaces
		// even while it is not due to run.
		const task = await seed({ enabled: false });
		expect(task.state).toBe('paused');
		expect(task.nextRunAt).toBeNull();
	});

	test('never overwrites a cadence the operator has since edited', async () => {
		const first = await seed();
		await repository.write(
			first.id,
			{
				name: 'Director fleet cycle',
				projects: [],
				projectScope: 'none',
				schedule: { expression: '30 4 * * 1', kind: 'cron', timezone: 'America/Chicago' },
				target: { type: 'director' },
			},
			Date.now(),
		);
		const reseeded = await seed({ intervalHours: 1 });
		expect(reseeded.schedule).toEqual({
			expression: '30 4 * * 1',
			kind: 'cron',
			timezone: 'America/Chicago',
		});
		// The marker survives an ordinary edit, which is what keeps the seed from firing again.
		expect(reseeded.systemKey).toBe(DIRECTOR_SYSTEM_KEY);
	});

	test('leaves a paused built-in paused across a later boot', async () => {
		const first = await seed();
		await repository.setState(first.id, 'paused', null, Date.now());
		const reseeded = await seed();
		expect(reseeded.state).toBe('paused');
		expect(reseeded.nextRunAt).toBeNull();
	});
});

describe('what the built-in Director task allows', () => {
	let service: ScheduledTaskService;

	beforeEach(() => {
		service = createService();
	});

	afterEach(() => {
		service.dispose();
	});

	test('refuses to create a second Director cycle', () => {
		expect(() =>
			service.create({
				name: 'Another Director',
				projects: [],
				projectScope: 'none',
				schedule: { expression: '0 9 * * *', kind: 'cron', timezone: 'UTC' },
				target: { type: 'director' },
			}),
		).toThrow('built in');
	});

	test('takes the name and cadence from an edit and everything else from the row', async () => {
		const seeded = await service.ensureDirectorTask({
			enabled: true,
			intervalHours: 12,
			timezone: 'UTC',
		});
		const updated = await service.update(seeded.id, {
			name: 'Fleet review',
			// What an edited form could still send, whether through a stale client or a hand-rolled
			// request. None of it may re-point a built-in task.
			projects: ['D:/applications/aidd'],
			projectScope: 'explicit',
			schedule: { expression: '30 6 * * *', kind: 'cron', timezone: 'America/Chicago' },
			target: {
				args: '',
				executionIntent: 'review-only',
				skillId: 'anything',
				type: 'skill',
			},
		});
		expect(updated.name).toBe('Fleet review');
		expect(updated.schedule).toEqual({
			expression: '30 6 * * *',
			kind: 'cron',
			timezone: 'America/Chicago',
		});
		expect(updated.target).toEqual({ type: 'director' });
		expect(updated.projectScope).toBe('none');
		expect(updated.projects).toEqual([]);
		expect(updated.systemKey).toBe(DIRECTOR_SYSTEM_KEY);
	});

	test('refuses to archive itself and offers the alternative', async () => {
		const seeded = await service.ensureDirectorTask({
			enabled: true,
			intervalHours: 12,
			timezone: 'UTC',
		});
		await expect(service.archive(seeded.id)).rejects.toThrow('Pause it instead');
		expect((await service.detail(seeded.id)).state).toBe('active');
	});

	test('pauses and resumes like any other task', async () => {
		const seeded = await service.ensureDirectorTask({
			enabled: true,
			intervalHours: 12,
			timezone: 'UTC',
		});
		await service.pause(seeded.id);
		const paused = await service.detail(seeded.id);
		expect(paused.state).toBe('paused');
		expect(paused.nextRunAt).toBeNull();
		await service.resume(seeded.id);
		const resumed = await service.detail(seeded.id);
		expect(resumed.state).toBe('active');
		expect(resumed.nextRunAt).not.toBeNull();
	});
});
