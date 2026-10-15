import { captureDescendants, killProcessTree, stopProcessTree } from 'aidd-shared/lib/processTree';

import { STEP_CLEANUP_TIMEOUT_MS } from './constants.ts';

type ShellProcess = ReturnType<typeof Bun.spawn>;

/**
 * Kills a session's shell steps outright: they have no iteration boundary to stop at.
 *
 * A shell stopped while it is still starting can lose the race with its own command. Git Bash's
 * launcher starts the real bash, which forks the command between the kill's process-table snapshot
 * and the kill itself; the command survives as an orphan holding the step's output pipe open, so
 * the step never returns and its session never finishes stopping. The tree is therefore read before
 * signalling, and any process the runner still holds afterwards gets a second sweep from each
 * captured pid: stopProcessTree reaches what a dead root still links in the table.
 * @param processes The session's tracked shell processes.
 * @param stillHeld Whether the runner is still waiting on a process (its output not yet closed).
 */
export async function killShellProcesses(
	processes: readonly ShellProcess[],
	stillHeld: (childProcess: ShellProcess) => boolean,
): Promise<void> {
	const captured = new Map<ShellProcess, number[]>();
	for (const childProcess of processes) {
		const descendants = await captureDescendants(childProcess.pid);
		captured.set(childProcess, [childProcess.pid, ...descendants.map((entry) => entry.pid)]);
		await killProcessTree(childProcess.pid);
		childProcess.kill();
	}
	await Promise.allSettled(
		processes.map((childProcess) =>
			Promise.race([childProcess.exited, Bun.sleep(STEP_CLEANUP_TIMEOUT_MS)]),
		),
	);
	for (const childProcess of processes) {
		if (!stillHeld(childProcess)) continue;
		for (const pid of captured.get(childProcess) ?? []) await stopProcessTree(pid);
	}
}
