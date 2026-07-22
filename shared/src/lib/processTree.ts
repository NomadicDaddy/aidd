import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isProcessAlive(pid)) return true;
		await sleep(25);
	}
	return !isProcessAlive(pid);
}

/**
 * Cross-platform process tree termination.
 *
 * On Windows, invokes `taskkill /pid <pid> /t /f` and waits up to `timeoutMs` for the target
 * process to disappear before returning. On POSIX, sends SIGKILL to the entire process group
 * (using the negative-pid convention) so grandchild processes spawned by the target are not
 * orphaned. Falls back to a direct signal to the root pid if the group signal fails. Swallows
 * errors from already-exited processes. Safe to call with `undefined` (no-op).
 */
export async function killProcessTree(pid: number | undefined, timeoutMs = 1000): Promise<void> {
	if (pid === undefined) return;
	if (!isProcessAlive(pid)) return;
	if (process.platform === 'win32') {
		try {
			const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
				stdio: 'ignore',
				windowsHide: true,
			});
			await Promise.race([
				new Promise<void>((resolve) => {
					killer.once('close', () => resolve());
					killer.once('error', () => resolve());
				}),
				sleep(timeoutMs),
			]);
		} catch {
			// Fall through to direct signal below.
		}
		if (await waitForProcessExit(pid, timeoutMs)) return;
	}
	// On POSIX, signal the detached process group (negative pid) so grandchildren
	// are killed too, not just the root process. The negative-pid convention sends
	// the signal to every process in the process group whose ID equals pid.
	// This matters for idle-abort: a detached run's grandchildren (e.g. a coding
	// agent's spawned tool processes) would otherwise be orphaned if only the root
	// pid received the signal.
	try {
		process.kill(-pid, 'SIGKILL');
	} catch {
		// The process may not be a process group leader, or may have already exited.
		// Fall back to signaling just the root pid.
		try {
			process.kill(pid, 'SIGKILL');
		} catch {
			// Process may already have exited.
		}
	}
	await waitForProcessExit(pid, timeoutMs);
}
