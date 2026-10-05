import { readProcessEntry } from '../../lib/processTable.ts';
import { isProcessAlive } from '../../lib/processTree.ts';

/**
 * Whether the process a run recorded is still that run's process.
 *
 * - `dead`: no pid, the pid is gone, or the pid now belongs to another process (its start time
 *   differs from the one the run recorded). Windows recycles pids quickly, so a live pid alone
 *   proves nothing about a run whose heartbeat has stopped.
 * - `alive`: the pid runs and its start time is the one the run recorded.
 * - `unknown`: the pid runs but identity cannot be checked: the record predates start times, or
 *   the platform reports none. Callers keep their previous, conservative behaviour for this.
 *
 * Reading a start time on Windows scans the process table, so callers consult this only for the
 * rare case it decides: a stale heartbeat whose pid still answers.
 */
export type RunProcessLiveness = 'alive' | 'dead' | 'unknown';

export async function runProcessLiveness(
	pid: null | number,
	pidStartId: null | string,
	readEntry: typeof readProcessEntry = readProcessEntry,
): Promise<RunProcessLiveness> {
	if (pid === null || !isProcessAlive(pid)) return 'dead';
	if (!pidStartId) return 'unknown';
	const entry = await readEntry(pid);
	// Gone between the signal probe and the table read.
	if (!entry) return 'dead';
	if (!entry.startId) return 'unknown';
	return entry.startId === pidStartId ? 'alive' : 'dead';
}

/** This process's start-time token, recorded beside its pid so a later reader can check identity. */
export async function ownProcessStartId(
	readEntry: typeof readProcessEntry = readProcessEntry,
): Promise<null | string> {
	return (await readEntry(process.pid))?.startId ?? null;
}
