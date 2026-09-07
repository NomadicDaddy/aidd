import { closeSync, openSync, readFileSync, unlinkSync } from 'node:fs';

// Flag that puts the CLI/binary into "relauncher" mode. The web backend launches
// `<program> --detached-spawn <payloadFile>` so the program re-spawns the real run
// as its own child and babysits it — see runDetachedSpawn for why this exists.
export const DETACHED_SPAWN_FLAG = '--detached-spawn';

export interface DetachedSpawnPayload {
	/** Full argv of the real run (program + entrypoint + flags). */
	args: string[];
	/** Working directory for the real run. */
	cwd: string;
	/** Append-target for the real run's stderr (the run log), mirroring launch.ts. */
	logPath: string;
}

// Windows-only detachment shim. The web backend starts this relauncher through a
// short-lived hidden Start-Process bridge so it does not inherit the web listener socket.
// The relauncher then re-spawns the real run as its child and stays alive until it exits,
// keeping the run independent of web restarts without the handle inheritance a
// cmd/start launch would carry.
//
// The real argv arrives via a payload FILE, so user-controlled args (e.g. --prompt)
// never need shell quoting.
export async function runDetachedSpawn(payloadPath: string | undefined): Promise<number> {
	if (!payloadPath) {
		console.error(`${DETACHED_SPAWN_FLAG} requires a payload file path`);
		return 1;
	}
	let payload: DetachedSpawnPayload;
	try {
		payload = JSON.parse(readFileSync(payloadPath, 'utf8')) as DetachedSpawnPayload;
	} catch (error) {
		console.error(`Failed to read detached-spawn payload: ${String(error)}`);
		return 1;
	}
	// One-shot payload: remove it as soon as it is read so it cannot leak the launch argv
	// or be replayed. Best-effort — a failed unlink is harmless litter under run-logs.
	try {
		unlinkSync(payloadPath);
	} catch {
		// ignore
	}
	if (!Array.isArray(payload.args) || payload.args.length === 0) {
		console.error('detached-spawn payload has no command to run');
		return 1;
	}
	// stderr -> run log (append), so an early crash in the real run is still captured —
	// the same contract launch.ts relies on for direct (POSIX) spawns.
	const stderrFd = openSync(payload.logPath, 'a');
	let child: Bun.Subprocess;
	try {
		child = Bun.spawn(payload.args, {
			cwd: payload.cwd,
			stderr: stderrFd,
			stdin: 'ignore',
			stdout: 'ignore',
			windowsHide: true,
		});
	} finally {
		// The child inherited (duplicated) the fd; drop our copy so we don't pin the handle.
		closeSync(stderrFd);
	}
	// Babysit: awaiting keeps this relauncher alive for the run's whole lifetime, which is
	// what keeps the run alive (it is in our job object). Do NOT unref the child here.
	const code = await child.exited;
	return code ?? 0;
}
