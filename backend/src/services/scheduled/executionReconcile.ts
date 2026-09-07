import type {
	ScheduledExecutionChild,
	ScheduledExecutionStatus,
} from 'aidd-shared/contracts/scheduled-tasks';

import { eq, inArray } from 'drizzle-orm';

import type { WebDatabaseHandle } from '../../db/client.ts';

import {
	directorCycles,
	pipelineSessions,
	runs,
	scheduledTaskExecutions,
} from '../../db/schema.ts';
import { aggregateExecutionStatus } from './outcomes.ts';

type ExecutionRow = typeof scheduledTaskExecutions.$inferSelect;

export type FinishedExecutionStatus = Exclude<ScheduledExecutionStatus, 'queued' | 'running'>;

/**
 * Derives an occurrence's outcome from the work it started.
 *
 * An occurrence never records its own success. It records what it launched, and this reads those
 * children back on every tick until they all reach a terminal state, so an outcome survives a
 * restart in the middle of a long run.
 */
export class ScheduledExecutionReconciler {
	private readonly database: WebDatabaseHandle;

	constructor(database: WebDatabaseHandle) {
		this.database = database;
	}

	async reconcile(dispatching: ReadonlySet<string>): Promise<void> {
		const active = await this.database.db
			.select()
			.from(scheduledTaskExecutions)
			.where(inArray(scheduledTaskExecutions.status, ['queued', 'running']));
		for (const execution of active) {
			if (dispatching.has(execution.id)) continue;
			await this.reconcileOne(execution);
		}
	}

	/**
	 * Records an occurrence's terminal outcome.
	 * @param executionId The occurrence.
	 * @param children What it launched.
	 * @param errors Dispatch errors, or the single sentence explaining a skip.
	 * @param status The terminal status.
	 * @returns Resolves once the terminal row is written.
	 */
	finish(
		executionId: string,
		children: ScheduledExecutionChild[],
		errors: string[],
		status: FinishedExecutionStatus,
	): Promise<void> {
		return this.database.commands.finishScheduledExecution({
			childrenJson: JSON.stringify(children),
			completedAt: Date.now(),
			dispatchErrorsJson: JSON.stringify(errors),
			executionId,
			status,
		});
	}

	private async reconcileOne(execution: ExecutionRow): Promise<void> {
		const executionId = execution.id;
		// A Director cycle is read back as a third kind of child. Its fast path writes a cycle row and
		// no run row, so an occurrence that launched one would otherwise look childless and finalize
		// as failed the moment the tick after dispatch arrived.
		const [childRuns, childSessions, childCycles] = await Promise.all([
			this.database.db
				.select()
				.from(runs)
				.where(eq(runs.scheduledTaskExecutionId, executionId)),
			this.database.db
				.select()
				.from(pipelineSessions)
				.where(eq(pipelineSessions.scheduledTaskExecutionId, executionId)),
			this.database.db
				.select()
				.from(directorCycles)
				.where(eq(directorCycles.scheduledTaskExecutionId, executionId)),
		]);
		const errors = JSON.parse(execution.dispatchErrorsJson) as string[];
		// A no-project occurrence launches from the applications root, which is a working directory
		// rather than a project. Reporting it as the child's project would name a target the task
		// does not have.
		const pathOf = (path: string): null | string =>
			execution.projectScope === 'none' ? null : path;
		const children: ScheduledExecutionChild[] = [
			...childRuns.map((run) => ({
				id: run.id,
				projectPath: pathOf(run.projectPath),
				status: run.status as ScheduledExecutionChild['status'],
				type: 'run' as const,
			})),
			...childSessions.map((session) => ({
				id: session.id,
				projectPath: pathOf(session.projectPath),
				status: session.status as ScheduledExecutionChild['status'],
				type: 'session' as const,
			})),
			...childCycles.map((cycle) => ({
				id: cycle.id,
				projectPath: null,
				status: cycle.status as ScheduledExecutionChild['status'],
				type: 'cycle' as const,
			})),
		];
		const status = aggregateExecutionStatus({
			cycles: childCycles,
			dispatchErrors: errors,
			runs: childRuns,
			sessions: childSessions,
		});
		if (status !== 'running') {
			await this.finish(executionId, children, errors, status);
		} else if (children.length > 0) {
			await this.database.db
				.update(scheduledTaskExecutions)
				.set({ childrenJson: JSON.stringify(children) })
				.where(eq(scheduledTaskExecutions.id, executionId));
		}
	}
}
