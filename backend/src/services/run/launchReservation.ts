import type { DbCommands } from '../../db/commands.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { webLogger } from '../../logger.ts';

/**
 * Broadcasts an abandoned launch as a failure and rethrows.
 *
 * Ceiling rejection, reservation write error and spawn error all end the same way, so a client
 * that optimistically rendered the run id sees it settle instead of hanging on 'running'.
 * @param hub - Socket hub the panel listens on.
 * @param runId - Run id the abandoned launch reserved.
 * @param err - The failure to report and rethrow.
 */
export function failLaunch(hub: WebSocketHub, runId: string, err: unknown): never {
	const message = err instanceof Error ? err.message : String(err);
	hub.broadcast({ payload: { error: message, status: 'failed' }, runId, type: 'run_status' });
	throw err instanceof Error ? err : new Error(message);
}

/**
 * Releases a ceiling reservation whose child never started.
 *
 * Best-effort on purpose: the spawn error is what the caller has to see, so a cleanup failure is
 * logged rather than substituted for it. The command's own guards make the blind call safe.
 * @param commands - Worker-backed command facade.
 * @param runId - Run id whose reservation is being released.
 */
export async function releaseRunSlot(commands: DbCommands, runId: string): Promise<void> {
	try {
		await withSqliteRetry(() => commands.releaseRunReservation({ runId }), {
			label: 'run.launch.release',
		});
	} catch (err) {
		webLogger.warn({ err, runId }, 'Failed to release the run ceiling reservation');
	}
}

/**
 * Stamps the POSIX child's pid onto the reserved row after the spawn.
 *
 * Also best-effort: the run is admitted and executing by now, and the first heartbeat mirrors the
 * real pid onto the row anyway, so a failure here narrows the window in which `killRun` has no pid
 * to signal rather than invalidating the launch.
 * @param commands - Worker-backed command facade.
 * @param runId - Run id the spawned child belongs to.
 * @param pid - The spawned child's process id.
 */
export async function recordSpawnedPid(
	commands: DbCommands,
	runId: string,
	pid: number,
): Promise<void> {
	try {
		await withSqliteRetry(() => commands.setRunPid({ pid, runId }), {
			label: 'run.launch.pid',
		});
	} catch (err) {
		webLogger.warn({ err, runId }, 'Failed to record the launched run pid');
	}
}
