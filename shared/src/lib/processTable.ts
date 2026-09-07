/**
 * Snapshots the OS process table (pid, ppid, and a start-time identity token).
 *
 * On Windows the only source that carries a parent pid is WMI, and it is expensive: the
 * `Get-CimInstance Win32_Process` query measures 3.2-3.5s on an idle developer machine (the
 * `pwsh` cold start is only ~0.2s of that; the WMI query is the rest). Every cheaper source was
 * measured and rejected: `Get-Process` is ~0.4s but its `.Parent` is empty for most rows,
 * `tasklist` carries no ppid at all, and `wmic` no longer ships with Windows.
 *
 * That cost is why the probe budget adapts. A fixed 10s ceiling is comfortable when the query
 * takes 3.3s and far too tight when the machine is loaded, and a probe that times out returns
 * no table - which makes the reaper fail toward leaking (see childProcessReaper.ts). Calibrating
 * against what this machine actually costs keeps a slow box reaping instead of silently giving
 * up.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import { listProcessTableNative } from './processTableWin.ts';

export interface ProcessTableEntry {
	/**
	 * Executable name, when the source reports one. Never used in a decision — a name is not an
	 * identity — but a reap logged as bare pids cannot be audited after the fact, since the numbers
	 * are gone by the time anyone reads the line.
	 */
	name?: string;
	pid: number;
	ppid: number;
	/** Start-time token used to detect pid reuse; absent when the platform cannot report it. */
	startId?: string;
}

export type ProcessTableLister = () => Promise<null | ProcessTableEntry[]>;

const minProbeTimeoutMs = 10_000;
const maxProbeTimeoutMs = 60_000;
/** Headroom over the observed cost: a loaded machine is slower by an unpredictable factor. */
const probeTimeoutMultiplier = 4;

/** Smoothed cost of a successful probe on this machine; seeds the adaptive budget. */
let observedProbeMs: number | undefined;

export function probeTimeoutMs(): number {
	if (observedProbeMs === undefined) return minProbeTimeoutMs;
	const budget = observedProbeMs * probeTimeoutMultiplier;
	return Math.min(maxProbeTimeoutMs, Math.max(minProbeTimeoutMs, Math.round(budget)));
}

function recordProbeCost(durationMs: number): void {
	// Weighted toward the slowest recent probe: the budget should track the bad case, which is
	// the one that times out, not the median.
	observedProbeMs =
		observedProbeMs === undefined
			? durationMs
			: Math.max(durationMs, observedProbeMs * 0.7 + durationMs * 0.3);
}

async function runTableCommand(command: string[]): Promise<null | string> {
	// Bun.spawn throws (ENOENT) for a missing binary instead of returning a non-zero exit, so a
	// machine without pwsh/ps degrades to "no snapshot" rather than crashing the run.
	const startedAt = Date.now();
	try {
		const proc = Bun.spawn(command, {
			stderr: 'ignore',
			stdin: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});
		const read = (async () => {
			const stdout = await new Response(proc.stdout).text();
			const exitCode = await proc.exited;
			return exitCode === 0 ? stdout : null;
		})();
		const result = await Promise.race([read, sleep(probeTimeoutMs(), 'timeout' as const)]);
		if (result === 'timeout') {
			proc.kill();
			return null;
		}
		if (result !== null) recordProbeCost(Date.now() - startedAt);
		return result;
	} catch {
		return null;
	}
}

export function parsePidPpidTable(output: string): ProcessTableEntry[] {
	const entries: ProcessTableEntry[] = [];
	for (const line of output.split(/\r?\n/)) {
		const match = /^(\d+)\s+(\d+)(?:\s+(\S.*?))?\s*$/.exec(line.trim());
		if (!match) continue;
		const startId = match[3];
		entries.push({
			pid: Number(match[1]),
			ppid: Number(match[2]),
			...(startId !== undefined ? { startId } : {}),
		});
	}
	return entries;
}

const winProcessTableScript =
	'Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,CreationDate | ' +
	"ForEach-Object { '{0} {1} {2:yyyyMMddHHmmss.ffffff}' -f $_.ProcessId, $_.ParentProcessId, $_.CreationDate }";

/**
 * The chain of rows from `pid` upward, at most `maxHops` long, starting with `pid`'s own row.
 *
 * Windows is why this exists rather than a loop over readProcessEntry. Toolhelp has no single-pid
 * query, so readProcessEntry there walks the WHOLE table and pays an OpenProcess per process on the
 * box — which made an 8-hop ancestry walk eight full scans to answer one question, on the platform
 * the single-pid read was introduced to speed up. One snapshot, walked in memory, is the honest
 * version. POSIX genuinely does have a cheap per-pid read (/proc, or a one-process ps), so it keeps
 * doing that.
 */
export async function readProcessAncestry(
	pid: number,
	maxHops: number,
): Promise<ProcessTableEntry[]> {
	const chain: ProcessTableEntry[] = [];

	if (process.platform === 'win32') {
		const table = await listProcessTableNative();
		if (table === null) return chain;
		const rows = new Map(table.map((entry) => [entry.pid, entry]));
		let current = pid;
		for (let hop = 0; hop < maxHops; hop += 1) {
			const entry = rows.get(current);
			if (entry === undefined) break;
			chain.push(entry);
			if (entry.ppid <= 1) break;
			current = entry.ppid;
		}
		return chain;
	}

	let current = pid;
	for (let hop = 0; hop < maxHops; hop += 1) {
		const entry = await readProcessEntry(current);
		if (entry === null) break;
		chain.push(entry);
		if (entry.ppid <= 1) break;
		current = entry.ppid;
	}
	return chain;
}

/**
 * One process's row, read directly rather than by scanning the whole table.
 *
 * Root verification is the gate everything else hangs off: until a snapshot proves the backend is
 * our child, the reaper refuses to kill anything. Making that wait for a full table scan is a race
 * the reaper loses exactly when it matters — a backend that spawns its server and exits inside a
 * second is gone before the scan returns, its row never appears, and the leak survives. That is
 * what failed on Windows (a 3.4s WMI query) and again on a loaded 2-core Linux runner.
 *
 * Cheap on POSIX (a single /proc read). On Windows it is a whole-table scan — see
 * readProcessAncestry — so prefer that when walking a chain.
 */
export async function readProcessEntry(pid: number): Promise<null | ProcessTableEntry> {
	if (process.platform === 'win32') {
		const table = await listProcessTableNative();
		return table?.find((entry) => entry.pid === pid) ?? null;
	}

	// Linux: /proc/<pid>/stat is a single read.
	const procEntry = await readProcStatEntry(pid);
	if (procEntry !== null) return procEntry;

	// BSD/macOS: a single-process ps is still far cheaper than the whole table.
	const output = await runTableCommand(['ps', '-o', 'pid=,ppid=,lstart=', '-p', String(pid)]);
	return output === null ? null : (parsePidPpidTable(output)[0] ?? null);
}

/**
 * One row from /proc/<pid>/stat. Field 4 is the ppid and field 22 the start time, counted after
 * the comm field — which can itself contain spaces and parentheses, so slice from the last ')'
 * rather than splitting the whole line.
 */
async function readProcStatEntry(pid: number): Promise<null | ProcessTableEntry> {
	try {
		const stat = await Bun.file(`/proc/${pid}/stat`).text();
		const fields = stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/);
		const ppid = Number(fields[1]);
		const startTicks = fields[19];
		if (!Number.isInteger(ppid)) return null;
		// comm is the same slice bounds read the other way: first '(' to last ')'.
		const name = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
		const named = name.length > 0 ? { name } : {};
		return startTicks === undefined
			? { ...named, pid, ppid }
			: { ...named, pid, ppid, startId: `proc:${startTicks}` };
	} catch {
		return null; /* not Linux, or the process is already gone */
	}
}

/**
 * Linux: scan /proc directly instead of shelling out to ps. This is not (only) an optimization —
 * it is what keeps start-time tokens comparable. readProcessEntry reads /proc and stamps
 * `proc:<ticks>`; a table built from `ps -o lstart=` stamps a date string, and linkIsSound reads
 * any token difference as a recycled pid. With the root's row recorded via /proc and snapshots
 * via ps, every child of the root looked recycled, was never tracked, and every leak on Linux
 * survived teardown. One source, one format.
 */
async function listProcTable(): Promise<null | ProcessTableEntry[]> {
	try {
		const { readdir } = await import('node:fs/promises');
		const names = await readdir('/proc');
		const pids = names.filter((name) => /^\d+$/.test(name)).map(Number);
		if (pids.length === 0) return null;
		const rows = await Promise.all(pids.map((pid) => readProcStatEntry(pid)));
		const entries = rows.filter((row): row is ProcessTableEntry => row !== null);
		return entries.length > 0 ? entries : null;
	} catch {
		return null; /* no /proc: not Linux */
	}
}

export async function listProcessTable(): Promise<null | ProcessTableEntry[]> {
	if (process.platform === 'win32') {
		// Toolhelp via FFI: milliseconds instead of seconds, and fast enough that the first
		// snapshot lands while a short-lived backend is still alive — which is what makes its
		// children discoverable at all. Falls back to the PowerShell probe if FFI is unavailable.
		const native = await listProcessTableNative();
		if (native !== null) return native;

		const output = await runTableCommand([
			'pwsh',
			'-NoProfile',
			'-NonInteractive',
			'-Command',
			winProcessTableScript,
		]);
		return output === null ? null : parsePidPpidTable(output);
	}
	// Linux: same /proc source as readProcessEntry, so identity tokens compare equal.
	const procTable = await listProcTable();
	if (procTable !== null) return procTable;

	// lstart ("Thu Jul 10 09:15:02 2026") is the start-time identity token; procps and BSD ps
	// both support it, but a minimal ps (busybox) may not — fall back to pid/ppid alone there.
	const withStart = await runTableCommand(['ps', '-A', '-o', 'pid=,ppid=,lstart=']);
	if (withStart !== null) return parsePidPpidTable(withStart);
	const output = await runTableCommand(['ps', '-A', '-o', 'pid=,ppid=']);
	return output === null ? null : parsePidPpidTable(output);
}
