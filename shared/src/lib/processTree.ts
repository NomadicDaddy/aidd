import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { childPredatesParent } from './childReaperIdentity.ts';
import { listProcessTable, type ProcessTableEntry } from './processTable.ts';

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
 * The tree under `pid`, deepest first, from one process-table snapshot.
 *
 * This is what `taskkill /T` does internally — and why this code does not use it. `/T` walks
 * ParentProcessId with no notion of identity, and Windows keeps reporting a dead parent's number
 * on its orphans forever while freely reissuing that number to a new process. So a `/T` on a
 * recycled pid cascades into whatever tree happens to be hanging off the old number. A detached
 * run is exactly that shape (launch shell exits, relauncher and CLI orphan onto its number), which
 * is how a teardown kill aimed at a leaked child killed the run issuing it.
 *
 * `childPredatesParent` is the check `/T` cannot make: a process that already existed when its
 * claimed parent was created is not that parent's child, whatever the table says. Links that
 * cannot be judged (no start token) are still followed — this narrows the blast radius, it
 * does not require proof to kill.
 */
function collectTreePids(table: ProcessTableEntry[], rootPid: number): number[] {
	const children = new Map<number, ProcessTableEntry[]>();
	const rows = new Map<number, ProcessTableEntry>();
	for (const entry of table) rows.set(entry.pid, entry);
	for (const entry of table) {
		if (entry.pid === entry.ppid || entry.pid <= 1) continue;
		if (childPredatesParent(rows.get(entry.ppid), entry)) continue;
		const siblings = children.get(entry.ppid);
		if (siblings) siblings.push(entry);
		else children.set(entry.ppid, [entry]);
	}

	// Breadth-first, then reversed: children die before the parent that would otherwise notice.
	const ordered: number[] = [rootPid];
	const seen = new Set<number>([process.pid, rootPid]);
	for (let index = 0; index < ordered.length; index += 1) {
		const parentPid = ordered[index];
		if (parentPid === undefined) continue;
		for (const child of children.get(parentPid) ?? []) {
			if (seen.has(child.pid)) continue;
			seen.add(child.pid);
			ordered.push(child.pid);
		}
	}
	return ordered.reverse();
}

/** taskkill accepts repeated /PID, so a whole tree is one spawn. Exit status is not meaningful. */
async function taskkill(pids: number[], timeoutMs: number): Promise<void> {
	const args = ['/f', ...pids.flatMap((pid) => ['/pid', String(pid)])];
	const killer = spawn('taskkill', args, { stdio: 'ignore', windowsHide: true });
	await Promise.race([
		new Promise<void>((resolve) => {
			killer.once('close', () => resolve());
			killer.once('error', () => resolve());
		}),
		sleep(timeoutMs),
	]);
}

/** A descendant and the token that says it is still the same process. */
export interface CapturedDescendant {
	pid: number;
	startId?: string | undefined;
}

/**
 * The descendants of `pid`, captured while the parent links still exist.
 *
 * Enumerate before signalling, never after. On POSIX an orphan reparents to init the moment its
 * parent dies, so it is no longer reachable from the root. On Windows the table keeps reporting the
 * dead parent's number, but only until the system reissues it — and a tree walked from a reissued
 * number describes an unrelated process. Capturing first sidesteps both: the snapshot names the
 * processes, and killCapturedDescendants rechecks their identity before killing anything.
 * @param pid The root process.
 * @returns Its descendants, deepest first, or an empty list when the table cannot be read.
 */
export async function captureDescendants(pid: number): Promise<CapturedDescendant[]> {
	const table = await listProcessTable().catch(() => null);
	if (table === null) return [];
	const rows = new Map(table.map((entry) => [entry.pid, entry]));
	return collectTreePids(table, pid)
		.filter((candidate) => candidate !== pid && candidate !== process.pid)
		.map((candidate) => {
			const startId = rows.get(candidate)?.startId;
			return startId === undefined ? { pid: candidate } : { pid: candidate, startId };
		});
}

/**
 * Kills what a captured tree left behind, skipping any pid the operating system has since handed
 * to someone else: a captured start token that no longer matches the live one is a different
 * process wearing a recycled number, and killing it would be the reuse bug this guards against.
 * A descendant captured without a token is still killed — the snapshot is the evidence.
 * @param captured Descendants from captureDescendants, taken before the root was signalled.
 * @param timeoutMs Budget for each kill.
 * @returns How many processes were killed.
 */
export async function killCapturedDescendants(
	captured: readonly CapturedDescendant[],
	timeoutMs = 1000,
): Promise<number> {
	const alive = captured.filter((entry) => isProcessAlive(entry.pid));
	if (alive.length === 0) return 0;
	const table = await listProcessTable().catch(() => null);
	const rows = new Map((table ?? []).map((entry) => [entry.pid, entry]));
	let killed = 0;
	for (const entry of alive) {
		const live = rows.get(entry.pid);
		if (entry.startId !== undefined && live?.startId !== undefined) {
			if (live.startId !== entry.startId) continue;
		}
		await killProcessTree(entry.pid, timeoutMs);
		killed += 1;
	}
	return killed;
}

/**
 * Cross-platform process tree termination.
 *
 * On Windows, enumerates the tree from a process-table snapshot (see collectTreePids) and kills
 * each pid with `taskkill /F`, waiting up to `timeoutMs` for the target to disappear. On POSIX,
 * enumerates the same descendant tree and sends SIGKILL to each pid. This also handles children
 * that are not process-group leaders. Swallows errors from already-exited processes. Safe to call with
 * `undefined` (no-op), and never kills the calling process.
 */
export async function killProcessTree(pid: number | undefined, timeoutMs = 1000): Promise<void> {
	if (pid === undefined || pid === process.pid) return;
	if (!isProcessAlive(pid)) return;
	if (process.platform === 'win32') {
		try {
			// Bounded by the caller's budget: the Toolhelp snapshot is milliseconds, but the
			// PowerShell fallback behind it costs seconds, and a kill that arrives late is worse
			// than one that only reaches the root — which is what the POSIX-style fallthrough and
			// the caller's own retry are for.
			const table = await Promise.race([
				listProcessTable(),
				sleep(timeoutMs, null as null | ProcessTableEntry[]),
			]);
			await taskkill(table === null ? [pid] : collectTreePids(table, pid), timeoutMs);
		} catch {
			// Fall through to direct signal below.
		}
		if (await waitForProcessExit(pid, timeoutMs)) return;
	}
	const table = process.platform === 'win32' ? null : await listProcessTable();
	for (const target of table === null ? [pid] : collectTreePids(table, pid)) {
		try {
			process.kill(target, 'SIGKILL');
		} catch {
			// Process may already have exited.
		}
	}
	await waitForProcessExit(pid, timeoutMs);
}
