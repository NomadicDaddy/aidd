/**
 * Growing the reaper's tracked descendant set from a process-table snapshot.
 *
 * Split from childProcessReaper.ts to keep that file under the 300-line ceiling. The kill decisions
 * live there; this is only the bookkeeping that decides which pids belong to the run at all.
 */

import type { ProcessTableEntry } from './processTable.ts';

import { childPredatesParent, linkIsSound } from './childReaperIdentity.ts';

export interface DescendantTracking {
	/** pid -> row recorded at first observation. Mutated in place; dead pids are kept on purpose. */
	descendants: Map<number, ProcessTableEntry>;
	/**
	 * Tracked pids observed gone from a snapshot. Mutated in place. They keep the children already
	 * recorded through them, but adopt no new ones — see the retirement note below.
	 */
	retired: Set<number>;
	rootPid: number;
	/** The root's row as first observed, if we have seen it yet. */
	rootRow: ProcessTableEntry | undefined;
	rootVerified: boolean;
}

/**
 * Fold a snapshot into the tracked set: record the root's row, latch verification if the table
 * proves the root is our child, and take the transitive closure of its descendants to a fixpoint.
 *
 * A pid joins when its parent is the root or an already-tracked descendant — including a dead one
 * recorded in an earlier snapshot, which is deliberate: the intermediate shell that spawned a
 * leaked server usually exits, and dropping the link with it would leave the server unattributable
 * to the run.
 *
 * Two guards keep that from turning into a liability once the OS reissues a pid we are still
 * tracking. `linkIsSound` rejects a parent that is *present* under a different token. Retirement
 * covers the case that has no token to compare and that actually bit us: a tracked pid that is
 * simply gone, whose number the OS then hands to a process with pre-existing orphans pointing at
 * it. Any row naming it as parent from that point on is unattributable, so once a tracked pid is
 * observed gone it stops adopting. The cost is a child first seen after its intermediate died, and
 * the dense early sampling cadence exists to make that window small.
 */
export function extendDescendants(
	state: DescendantTracking,
	table: ProcessTableEntry[],
): Pick<DescendantTracking, 'rootRow' | 'rootVerified'> {
	const { descendants, retired, rootPid } = state;
	const tableRootRow = table.find((entry) => entry.pid === rootPid);
	const rootRow = state.rootRow ?? tableRootRow;
	const rootVerified =
		state.rootVerified || rootPid === process.pid || tableRootRow?.ppid === process.pid;

	const rows = new Map<number, ProcessTableEntry>();
	for (const entry of table) rows.set(entry.pid, entry);
	for (const pid of descendants.keys()) if (!rows.has(pid)) retired.add(pid);

	let added = true;
	while (added) {
		added = false;
		for (const entry of table) {
			if (entry.pid === rootPid || descendants.has(entry.pid)) continue;
			if (entry.pid === entry.ppid) continue;
			const linksToRoot = entry.ppid === rootPid;
			if (!linksToRoot && !descendants.has(entry.ppid)) continue;
			if (retired.has(entry.ppid)) continue;
			const recordedParent = linksToRoot ? rootRow : descendants.get(entry.ppid);
			if (!linkIsSound(recordedParent, rows.get(entry.ppid))) continue;
			// The root is never retired — a backend that exits leaving a server behind is the leak
			// this exists to catch — so its links carry the ordering check instead.
			if (childPredatesParent(recordedParent, entry)) continue;
			descendants.set(entry.pid, entry);
			added = true;
		}
	}

	return { rootRow, rootVerified };
}
