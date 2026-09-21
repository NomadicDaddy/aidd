import { eq } from 'drizzle-orm';

import type { LocalTransaction, StartDirectorCycleIfIdleArgs } from './types.ts';

import { directorCycles } from '../schema.ts';

/**
 * Atomically refuses to start a second Director cycle while one is already running.
 *
 * Every cycle inserts a `running` row before it does anything else, so that row is the whole
 * predicate: it covers in-process cycles, detached cycles resumed after a restart, and cycles
 * started by another entry point. Reading and inserting in one transaction is what makes it a gate
 * rather than a suggestion, in the same shape queued-run admission uses for the run ceiling.
 * Without it the scheduled cycle and the operator's Run Cycle button could both pass a separate
 * check and stack two cycles over the same fleet.
 */
export function startDirectorCycleIfIdle(
	tx: LocalTransaction,
	args: StartDirectorCycleIfIdleArgs,
): { kind: 'busy'; runningCycleId: string } | { kind: 'started' } {
	const running = tx
		.select({ id: directorCycles.id })
		.from(directorCycles)
		.where(eq(directorCycles.status, 'running'))
		.limit(1)
		.all();
	const busy = running[0];
	if (busy) return { kind: 'busy', runningCycleId: busy.id };
	tx.insert(directorCycles).values(args.values).run();
	return { kind: 'started' };
}
