import { and, eq, isNull } from 'drizzle-orm';

import type { LocalTransaction, ReleaseRunReservationArgs, SetRunPidArgs } from './types.ts';

import { runs } from '../schema.ts';

/**
 * Stamps the spawned child's pid onto a row that was reserved before the spawn.
 *
 * POSIX only: there the detached child IS the run, so its pid is the one `killRun` has to reach.
 * On Windows the spawned process is the short-lived pwsh bridge, whose pid stops meaning anything
 * the moment it exits, so the row stays pid-less until the first heartbeat mirrors the real CLI
 * pid (see persistRunLiveness). The `running` guard keeps a run the heartbeat watcher has already
 * driven terminal from being stamped with a pid after the fact.
 *
 * Returns the number of rows updated: 0 means the run was already terminal.
 */
export function setRunPid(tx: LocalTransaction, args: SetRunPidArgs): number {
	const matched = tx
		.select({ id: runs.id })
		.from(runs)
		.where(and(eq(runs.id, args.runId), eq(runs.status, 'running')))
		.all();
	if (matched.length === 0) return 0;
	tx.update(runs).set({ pid: args.pid }).where(eq(runs.id, args.runId)).run();
	return matched.length;
}

/**
 * Gives back a ceiling reservation whose child never started.
 *
 * launchRun reserves the row before it spawns anything, so admission is decided while refusing is
 * still free. The cost of that ordering is this rollback: a spawn that throws must release the
 * slot or the ceiling leaks a phantom `running` row that nothing will ever terminalize.
 *
 * The guards make a blind call safe. Only a row that is still `running`, still pid-less and has
 * never been heartbeated is removed, so a reservation whose child did start — and is already
 * reporting — is left alone for the heartbeat watcher to own.
 *
 * Returns the number of rows deleted: 0 means the reservation was no longer eligible.
 */
export function releaseRunReservation(
	tx: LocalTransaction,
	args: ReleaseRunReservationArgs,
): number {
	const matched = tx
		.select({ id: runs.id })
		.from(runs)
		.where(
			and(
				eq(runs.id, args.runId),
				eq(runs.status, 'running'),
				isNull(runs.pid),
				isNull(runs.heartbeatAt),
			),
		)
		.all();
	if (matched.length === 0) return 0;
	tx.delete(runs).where(eq(runs.id, args.runId)).run();
	return matched.length;
}
