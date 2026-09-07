import type {
	ScheduledExecutionTrigger,
	ScheduledTask,
	ScheduledTaskTarget,
} from 'aidd-shared/contracts/scheduled-tasks';

import { eq, inArray } from 'drizzle-orm';

import type { WebDatabaseHandle } from '../../db/client.ts';
import type { ClaimScheduledTaskResult } from '../../db/commands/types.ts';
import type { ScheduledTaskDispatcher } from './dispatch.ts';
import type { ScheduledTaskRepository } from './repository.ts';
import type { ScheduledTaskValidator } from './validator.ts';

import { scheduledTaskExecutions } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { HttpError } from '../errors.ts';
import { ScheduledExecutionReconciler } from './executionReconcile.ts';
import { nextOccurrence } from './recurrence.ts';

const ACTIVE_RECONCILE_MS = 15_000;
const ERROR_RETRY_FLOOR_MS = 15_000;
const MAX_TIMER_SLEEP_MS = 60 * 60 * 1_000;

export function schedulerDelayMs(
	nextRunAt: null | number,
	now: number,
	hasActive: boolean,
): number {
	return Math.max(
		0,
		Math.min(
			MAX_TIMER_SLEEP_MS,
			hasActive
				? ACTIVE_RECONCILE_MS
				: nextRunAt === null
					? MAX_TIMER_SLEEP_MS
					: nextRunAt - now,
		),
	);
}

export class ScheduledTaskRuntime {
	private readonly database: WebDatabaseHandle;
	private readonly dispatcher: ScheduledTaskDispatcher;
	// Executions this process is still dispatching. Run Now dispatches outside the tick loop, so
	// without this a concurrent reconcile would see a claimed execution before its first child row
	// exists and finalize it as failed while its runs were still launching.
	private readonly dispatching = new Set<string>();
	private disposed = false;
	private readonly reconciler: ScheduledExecutionReconciler;
	private readonly repository: ScheduledTaskRepository;
	private ticking = false;
	private timer: null | ReturnType<typeof setTimeout> = null;
	private readonly validator: ScheduledTaskValidator;

	constructor(
		database: WebDatabaseHandle,
		dispatcher: ScheduledTaskDispatcher,
		repository: ScheduledTaskRepository,
		validator: ScheduledTaskValidator,
	) {
		this.database = database;
		this.dispatcher = dispatcher;
		this.reconciler = new ScheduledExecutionReconciler(database);
		this.repository = repository;
		this.validator = validator;
	}

	start(): void {
		if (this.disposed || this.timer) return;
		void this.tick(true);
	}

	dispose(): void {
		this.disposed = true;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}

	wake(): void {
		if (this.disposed) return;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		void this.tick(false);
	}

	async runNow(task: ScheduledTask): Promise<void> {
		const result = await this.claim(task, 'manual', null, null);
		if (result.kind === 'active')
			throw new HttpError('This task already has an active execution.', 409);
		if (result.kind !== 'claimed') throw new HttpError('Scheduled task is unavailable.', 409);
		await this.dispatchClaim(result, 'manual');
		// Run Now dispatches outside the timer, which was armed for a task that is not due yet and so
		// can be sleeping for the best part of an hour. Re-arming here drops the runtime onto the
		// active reconcile cadence, instead of leaving the occurrence reading "running" long after
		// the work it started has finished.
		this.wake();
	}

	private async claim(
		task: ScheduledTask,
		trigger: ScheduledExecutionTrigger,
		expectedDueAt: null | number,
		nextRunAt: null | number,
	): Promise<ClaimScheduledTaskResult> {
		const projectPaths =
			task.projectScope === 'all' ? await this.validator.resolveDispatchProjects([]) : null;
		return this.database.commands.claimScheduledTask({
			executionId: `scheduled_execution_${crypto.randomUUID()}`,
			expectedDueAt,
			nextRunAt,
			now: Date.now(),
			projectPaths,
			projectScope: task.projectScope,
			taskId: task.id,
			trigger,
		});
	}

	private async tick(catchUp: boolean): Promise<void> {
		if (this.ticking || this.disposed) return;
		this.ticking = true;
		// Claiming an all-project task discovers projects through the filesystem, so a transient
		// failure must not take the rest of the due tasks down with it. A failed claim also leaves
		// nextRunAt in the past, which would otherwise re-arm the timer at zero and spin on the same
		// error, so errors back off instead of retrying immediately.
		let failed = false;
		try {
			await this.reconciler.reconcile(this.dispatching);
			const now = Date.now();
			const due = (await this.repository.list(['active'])).filter(
				(task) => task.nextRunAt !== null && task.nextRunAt <= now,
			);
			for (const task of due) {
				try {
					const expected = task.nextRunAt!;
					const trigger = catchUp ? 'catch_up' : 'scheduled';
					const result = await this.claim(
						task,
						trigger,
						expected,
						nextOccurrence(task.schedule, now),
					);
					if (result.kind === 'claimed') await this.dispatchClaim(result, trigger);
				} catch (err) {
					failed = true;
					webLogger.error(
						{ error: err, taskId: task.id },
						'Scheduled task occurrence failed',
					);
				}
			}
		} catch (err) {
			failed = true;
			webLogger.error({ error: err }, 'Scheduled task tick failed');
		} finally {
			this.ticking = false;
			await this.armTimer(failed ? ERROR_RETRY_FLOOR_MS : 0);
		}
	}

	// The trigger travels with the claim rather than being re-derived downstream: the claim row
	// already records it, and losing it here would make Run now look timer-started in run history.
	private async dispatchClaim(
		result: Extract<ClaimScheduledTaskResult, { kind: 'claimed' }>,
		trigger: ScheduledExecutionTrigger,
	): Promise<void> {
		this.dispatching.add(result.executionId);
		try {
			await this.dispatchClaimed(result, trigger);
		} finally {
			this.dispatching.delete(result.executionId);
		}
	}

	private async dispatchClaimed(
		result: Extract<ClaimScheduledTaskResult, { kind: 'claimed' }>,
		trigger: ScheduledExecutionTrigger,
	): Promise<void> {
		await this.database.db
			.update(scheduledTaskExecutions)
			.set({ status: 'running' })
			.where(eq(scheduledTaskExecutions.id, result.executionId));
		let target: ScheduledTaskTarget;
		try {
			target = JSON.parse(result.targetJson) as ScheduledTaskTarget;
			await this.validator.validateTarget(target, true);
		} catch (err) {
			await this.reconciler.finish(
				result.executionId,
				[],
				[err instanceof Error ? err.message : String(err)],
				'failed',
			);
			return;
		}
		// A no-project occurrence has nothing to discover, so an empty path list is only a failure
		// for the scopes that expect projects.
		if (result.projectScope !== 'none' && result.projectPaths.length === 0) {
			await this.reconciler.finish(
				result.executionId,
				[],
				['No projects were available at dispatch time.'],
				'failed',
			);
			return;
		}
		const dispatched = await this.dispatcher.dispatch({
			executionId: result.executionId,
			projectPaths: result.projectPaths,
			scope: result.projectScope,
			target,
			trigger,
		});
		if (dispatched.children.length === 0) {
			const errors = dispatched.skipped ? [dispatched.skipped] : dispatched.errors;
			await this.reconciler.finish(
				result.executionId,
				[],
				errors,
				dispatched.skipped ? 'skipped' : 'failed',
			);
			return;
		}
		await this.database.db
			.update(scheduledTaskExecutions)
			.set({
				childrenJson: JSON.stringify(dispatched.children),
				dispatchErrorsJson: JSON.stringify(dispatched.errors),
			})
			.where(eq(scheduledTaskExecutions.id, result.executionId));
	}

	private async armTimer(floorMs = 0): Promise<void> {
		if (this.disposed) return;
		const tasks = await this.repository.list(['active']);
		const next = tasks.find((task) => task.nextRunAt !== null)?.nextRunAt ?? null;
		const active = await this.database.db
			.select({ id: scheduledTaskExecutions.id })
			.from(scheduledTaskExecutions)
			.where(inArray(scheduledTaskExecutions.status, ['queued', 'running']))
			.limit(1);
		const delay = Math.max(floorMs, schedulerDelayMs(next, Date.now(), active.length > 0));
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.tick(false);
		}, delay);
		this.timer.unref?.();
	}
}
