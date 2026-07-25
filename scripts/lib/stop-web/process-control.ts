import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const pidFileName = 'backend';

export function parseNetstatListeningPids(output: string, port: number): string[] {
	const pids = new Set<string>();
	for (const line of output.split(/\r?\n/)) {
		const parts = line.trim().split(/\s+/);
		if (parts.length < 5) continue;
		const protocol = parts[0]?.toUpperCase();
		const localAddress = parts[1];
		const state = parts[3]?.toUpperCase();
		const pid = parts[4];
		if (protocol !== 'TCP' || localAddress === undefined || state !== 'LISTENING') continue;
		if (pid === undefined || !/^\d+$/.test(pid)) continue;
		if (localAddress.endsWith(`:${port}`)) {
			pids.add(pid);
		}
	}
	return [...pids];
}

function findPidsOnPortWindows(port: number): string[] {
	const result = spawnSync('netstat', ['-ano'], {
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	if (result.status !== 0 || !result.stdout) return [];
	return parseNetstatListeningPids(result.stdout, port);
}

function findPidsOnPortUnix(port: number): string[] {
	const result = spawnSync('lsof', [`-tiTCP:${String(port)}`, '-sTCP:LISTEN'], {
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	if (result.status !== 0 || !result.stdout) return [];
	return [
		...new Set(
			result.stdout
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => /^\d+$/.test(line)),
		),
	];
}

export function findPidsOnPort(port: number): string[] {
	return process.platform === 'win32' ? findPidsOnPortWindows(port) : findPidsOnPortUnix(port);
}

export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function pidFilePath(logsDir: string): string {
	return join(logsDir, `${pidFileName}.pid`);
}

export function removePidFile(logsDir: string): void {
	const path = pidFilePath(logsDir);
	try {
		if (existsSync(path)) {
			unlinkSync(path);
		}
	} catch {
		// Best-effort cleanup only.
	}
}

export function readPidFile(logsDir: string): null | number {
	const path = pidFilePath(logsDir);
	if (!existsSync(path)) return null;
	const pid = Number(readFileSync(path, 'utf8').trim());
	if (!Number.isInteger(pid) || pid <= 0) {
		removePidFile(logsDir);
		return null;
	}
	return pid;
}

export async function waitForPortReleased(port: number, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const pids = findPidsOnPort(port).filter((pid) => Number(pid) !== process.pid);
		if (pids.length === 0) return true;
		if (Date.now() >= deadline) return false;
		await Bun.sleep(250);
	}
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isProcessAlive(pid)) return true;
		await Bun.sleep(250);
	}
	return !isProcessAlive(pid);
}

export async function killProcessTree(pid: number, label: string): Promise<boolean> {
	if (pid === process.pid) {
		console.log(`   Refusing to stop current process (${label}, PID ${pid})`);
		return false;
	}

	try {
		if (process.platform === 'win32') {
			execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'pipe' });
		} else {
			process.kill(pid, 'SIGTERM');
			if (!(await waitForExit(pid, 10_000))) {
				process.kill(pid, 'SIGKILL');
			}
		}
		console.log(`   Stopped process ${pid} (${label})`);
		return true;
	} catch {
		if (!isProcessAlive(pid)) {
			console.log(`   Process ${pid} already exited (${label})`);
			return true;
		}
		console.log(`   Could not stop process ${pid} (${label})`);
		return false;
	}
}

export async function stopPidFileProcess(logsDir: string, port: number): Promise<boolean> {
	const pid = readPidFile(logsDir);
	if (pid === null) return false;
	removePidFile(logsDir);
	if (!isProcessAlive(pid)) {
		console.log(`   Stale ${pidFileName}.pid found for PID ${pid}; cleaned up`);
		return false;
	}
	console.log(`   Found web backend via ${pidFileName}.pid (PID ${pid})`);
	return await killProcessTree(pid, `web port ${port}`);
}

/**
 * Returns the dead PID(s) an orphaned socket is bound to, or null when the port is
 * free or still held by a live process. An orphaned binding is left when a server
 * is terminated while a process that inherited its listen-socket handle is still
 * alive (or lingers after such a holder exits, before the OS reaps the binding):
 * there is no live process to kill, so a new server cannot bind until a reboot.
 */
export function findOrphanedSocketPids(port: number): null | number[] {
	const bound = findPidsOnPort(port)
		.map(Number)
		.filter((pid) => pid !== process.pid);
	if (bound.length === 0) return null;
	const dead = bound.filter((pid) => !isProcessAlive(pid));
	return dead.length === bound.length ? dead : null;
}

export interface ActiveRunPortPin {
	id: string;
	pid: number;
	projectPath: string;
}

/** Report an orphaned (reboot-only) port binding with remediation guidance. */
export function reportOrphanedSocket(
	port: number,
	orphanedPids: number[],
	activeRuns: ActiveRunPortPin[] = [],
): void {
	const pidList = orphanedPids.join(', ');
	console.log(
		`Port ${port} is still held by an orphaned socket bound to PID(s) ${pidList} that no longer exist.`,
	);
	console.log(
		'   This is a stale TCP binding left by an ungracefully-terminated server; there is no process to kill.',
	);
	if (activeRuns.length > 0) {
		console.log('   Active aidd run process(es) may still be pinning an inherited socket:');
		for (const run of activeRuns) {
			console.log(`   - ${run.id} (PID ${run.pid}, ${run.projectPath})`);
		}
		console.log('   Wait for those runs to finish, or stop/kill them from the Runs page.');
		return;
	}
	if (process.platform === 'win32') {
		console.log('   Free it by rebooting, or `netsh int ip reset` followed by a reboot.');
	}
}
