/**
 * Pid-identity checks for the reaper: "is this pid still the process we recorded?"
 *
 * Every kill the reaper makes hangs off one of these. A pid is not an identity — the OS reissues
 * the number as soon as the process is gone, and on Windows it does so quickly — so a pid the
 * reaper tracked minutes ago may belong to a stranger by teardown. Killing it would tear down that
 * stranger's whole process tree. The start-time token (`startId`) is what closes the gap: it
 * changes when the number is reissued, so `(pid, startId)` survives reuse where `pid` alone does
 * not.
 *
 * The rule these share: when identity cannot be established, fail toward leaking. A leaked server
 * holds a port and the next boot complains; a wrong kill takes down something that was never ours.
 */

import type { ProcessTableEntry } from './processTable.ts';

/**
 * Does a pid observed in the *current* table still look like the row we recorded?
 *
 * Only sound when `current` comes from a table taken now — see `confirmLiveIdentity` for the stale
 * case, where both sides of this comparison predate the check and prove nothing about the present.
 */
export function identityMatches(
	recorded: ProcessTableEntry,
	current: ProcessTableEntry | undefined,
	platform: NodeJS.Platform,
	isAlive: (pid: number) => boolean,
): boolean {
	// No current row: we cannot confirm identity, so we do not kill.
	if (current === undefined) return false;
	// Start-time identity is authoritative when both snapshots carry it: a recycled pid gets a new
	// start time, while an orphan keeps its own through any re-parenting.
	if (recorded.startId !== undefined && current.startId !== undefined) {
		return recorded.startId === current.startId;
	}
	if (current.ppid === recorded.ppid) return true;
	// Fallback for tables without start times (a minimal ps): Windows never rewrites
	// ParentProcessId, so any change means the pid was recycled. POSIX re-parents orphans (to init
	// or a subreaper), so accept a changed ppid only when the recorded parent is gone — the orphan
	// case this reaper exists for.
	if (platform === 'win32') return false;
	return !isAlive(recorded.ppid);
}

/**
 * Is the pid still the process we recorded, checked against a read taken *now*?
 *
 * The recorded row and any snapshot row both predate this call, so comparing them to each other
 * proves only that the pid was stable between two past moments — not that it still is. Only a
 * fresh read can rule out that the pid died and the OS handed the number to someone else. With no
 * token to compare, we cannot tell, and the answer is no.
 */
export async function confirmLiveIdentity(
	pid: number,
	recorded: ProcessTableEntry,
	readEntry: (pid: number) => Promise<null | ProcessTableEntry>,
): Promise<boolean> {
	if (recorded.startId === undefined) return false;
	const live = await readEntry(pid);
	return live !== null && live.startId === recorded.startId;
}

/**
 * Is `recorded` still the parent it was, rather than a recycled pid wearing its number?
 *
 * The reaper keeps dead pids in its descendant set on purpose, so a link survives the intermediate
 * shell that made it — that is what lets an orphaned server stay attributable to the run. The cost
 * is that a dead tracked pid the OS re-issues would otherwise adopt its new owner's children into
 * the kill set. So: a parent absent from the current table is the orphan case and the link stands;
 * a parent *present* under a different token is a different process, and its children are not ours.
 */
export function linkIsSound(
	recorded: ProcessTableEntry | undefined,
	current: ProcessTableEntry | undefined,
): boolean {
	if (recorded?.startId === undefined || current?.startId === undefined) return true;
	return recorded.startId === current.startId;
}

/**
 * Start-time token as a comparable number of ticks, or undefined when it is not one.
 *
 * Only two of the four listers stamp something ordered: Windows Toolhelp (a FILETIME in 100ns
 * ticks) and Linux /proc (`proc:<ticks since boot>`). The fallbacks do not — the Windows WMI probe
 * formats `yyyyMMddHHmmss.ffffff` and BSD/macOS `ps -o lstart=` a date string, and neither sorts
 * as a number. Those are reported unknown rather than compared, so every check built on this fails
 * open — which at both callers means declining to link, and leaking.
 *
 * The WMI token looks one `.` away from usable and is not: flattened it runs ~20 digits against
 * FILETIME's ~18, and listProcessTable can return either source between probes, so the two would
 * be compared across formats. Making that sound needs the tokens tagged by source the way `proc:`
 * already is, not a stripped dot.
 */
function startTicks(token: string | undefined): bigint | undefined {
	if (token === undefined) return undefined;
	const digits = token.startsWith('proc:') ? token.slice(5) : token;
	return /^\d+$/.test(digits) ? BigInt(digits) : undefined;
}

/**
 * Does `child` claim a parent that was created *after* it? Then the link is a lie.
 *
 * A process cannot predate its own parent, so this is proof — not a heuristic — that the ppid
 * names a recycled pid rather than the process that actually spawned the child. It is the one
 * check that catches an orphan whose long-dead parent's number has been reissued: the orphan's row
 * still carries the old number, and nothing else in the table distinguishes it from a real child.
 *
 * That case is not hypothetical here. A detached run's relauncher is permanently orphaned onto the
 * pid of the launch shell that exited seconds after spawning it; when the reaper tracked a process
 * that inherited that number, the whole run tree — the CLI doing the work — was enumerated as its
 * children and killed. Unknown tokens answer false: fail toward leaking.
 */
export function childPredatesParent(
	parent: ProcessTableEntry | undefined,
	child: ProcessTableEntry | undefined,
): boolean {
	const parentTicks = startTicks(parent?.startId);
	const childTicks = startTicks(child?.startId);
	if (parentTicks === undefined || childTicks === undefined) return false;
	return childTicks < parentTicks;
}
