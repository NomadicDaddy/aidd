/**
 * Growing the reaper's tracked descendant set from a process-table snapshot.
 *
 * Split from childProcessReaper.ts to keep that file under the 300-line ceiling. The kill decisions
 * live there; this is only the bookkeeping that decides which pids belong to the run at all.
 */

import type { ProcessTableEntry } from './processTable.ts';

import { linkIsSound } from './childReaperIdentity.ts';

export interface DescendantTracking {
	/** pid -> row recorded at first observation. Mutated in place; dead pids are kept on purpose. */
	descendants: Map<number, ProcessTableEntry>;
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
 * to the run. `linkIsSound` is what keeps that from turning into a liability when the OS reissues a
 * dead pid we are still tracking.
 */
export function extendDescendants(
	state: DescendantTracking,
	table: ProcessTableEntry[],
): Pick<DescendantTracking, 'rootRow' | 'rootVerified'> {
	const { descendants, rootPid } = state;
	const tableRootRow = table.find((entry) => entry.pid === rootPid);
	const rootRow = state.rootRow ?? tableRootRow;
	const rootVerified =
		state.rootVerified || rootPid === process.pid || tableRootRow?.ppid === process.pid;

	const rows = new Map<number, ProcessTableEntry>();
	for (const entry of table) rows.set(entry.pid, entry);

	let added = true;
	while (added) {
		added = false;
		for (const entry of table) {
			if (entry.pid === rootPid || descendants.has(entry.pid)) continue;
			if (entry.pid === entry.ppid) continue;
			const linksToRoot = entry.ppid === rootPid;
			if (!linksToRoot && !descendants.has(entry.ppid)) continue;
			const recordedParent = linksToRoot ? rootRow : descendants.get(entry.ppid);
			if (!linkIsSound(recordedParent, rows.get(entry.ppid))) continue;
			descendants.set(entry.pid, entry);
			added = true;
		}
	}

	return { rootRow, rootVerified };
}
