import { parseWebPidRecord } from 'aidd-shared/lib/webPidRecord';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';

/** One TCP connect attempt to 127.0.0.1:<port>; true when something accepts it. */
export function probePort(port: number, timeoutMs: number): Promise<boolean> {
	return new Promise<boolean>((res) => {
		const socket = new net.Socket();
		socket.setTimeout(timeoutMs);
		socket.once('connect', () => {
			socket.destroy();
			res(true);
		});
		socket.once('error', () => {
			socket.destroy();
			res(false);
		});
		socket.once('timeout', () => {
			socket.destroy();
			res(false);
		});
		socket.connect(port, '127.0.0.1');
	});
}

/**
 * The pid in logs/backend.pid, or null. Read-only: a read can land while the backend is writing
 * the file, so an unparseable file is "not yet", never a reason to delete it.
 */
export function recordedBackendPid(logsDir: string): null | number {
	const path = join(logsDir, 'backend.pid');
	try {
		return existsSync(path)
			? (parseWebPidRecord(readFileSync(path, 'utf8'))?.pid ?? null)
			: null;
	} catch {
		return null;
	}
}

export interface BackendReadinessProbe {
	/** Non-null once the spawned backend has exited. */
	exitCode: () => null | number;
	portOpen: () => Promise<boolean>;
	recordedPid: () => null | number;
}

export type BackendReadiness = 'exited' | 'ready' | 'timeout';

/**
 * Ready means the backend we spawned is the one serving: it has written its own pid to
 * logs/backend.pid (the backend does this after binding) and the port answers. A port that merely
 * answers proves nothing, because an old backend that did not stop answers it too. A spawned
 * backend that exits first is reported at once instead of after the timeout.
 */
export async function waitForOwnBackend(
	pid: number,
	probe: BackendReadinessProbe,
	timeoutMs: number,
	intervalMs: number,
): Promise<BackendReadiness> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (probe.exitCode() !== null) return 'exited';
		if (probe.recordedPid() === pid && (await probe.portOpen())) return 'ready';
		if (Date.now() >= deadline) return 'timeout';
		await Bun.sleep(intervalMs);
	}
}
