/**
 * Process-table probing for the reaper: one in-flight scan, shared, with the last good snapshot
 * kept for the teardown path.
 *
 * Split from childProcessReaper.ts to keep that file under the 300-line ceiling. Nothing here
 * decides anything; it only governs when a table is read and which one a caller gets.
 */

import type { ProcessTableEntry, ProcessTableLister } from './processTable.ts';

export class TableProbe {
	/** Last successful snapshot, kept so a failed final probe can still reap. */
	last: { at: number; rows: ProcessTableEntry[] } | undefined;
	private readonly listTable: ProcessTableLister;
	/** Bumped per probe, so a settling probe only retires the in-flight slot if it still owns it. */
	private generation = 0;
	/** In-flight probe, shared by concurrent callers so a slow table is paid for once. */
	private inFlight: Promise<null | ProcessTableEntry[]> | undefined;

	constructor(listTable: ProcessTableLister) {
		this.listTable = listTable;
	}

	/**
	 * Probe the table, coalescing concurrent callers onto one in-flight probe so a slow scan is
	 * paid for once. Deliberately NOT a time-based freshness cache: handing a "recent enough" table
	 * to a scheduled snapshot starves the sampling the reaper is built on, since descendants are
	 * only discoverable while their short-lived intermediates are alive, and a skipped sample is a
	 * leak that never gets linked to the root.
	 */
	async probe(force = false): Promise<null | ProcessTableEntry[]> {
		// force means "a snapshot taken after this moment". Joining an in-flight probe would not
		// do: the one already running may have started before the backend spawned the child we
		// are about to look for, and a descendant missing from the table is a descendant that
		// never gets reaped.
		if (!force && this.inFlight) return await this.inFlight;

		// Stamp the age from when the scan STARTED, not when it returned. The rows describe the
		// machine at the moment the table was read, and the read itself can take seconds on the
		// PowerShell fallback — crediting it with the finish time would call a 3s-old table fresh
		// and understate it against staleTableMaxAgeMs, which is the budget that decides whether
		// the topology is still worth trusting.
		const startedAt = Date.now();
		const generation = (this.generation += 1);
		const pending = (async () => {
			try {
				const table = await this.listTable();
				if (table) this.last = { at: startedAt, rows: table };
				return table;
			} finally {
				// Only retire the slot if a later (forced) probe has not already claimed it.
				// Clearing it unconditionally let an earlier probe settling second wipe the forced
				// probe's entry, so the next caller started a third scan instead of joining the
				// live one.
				if (this.generation === generation) this.inFlight = undefined;
			}
		})();
		this.inFlight = pending;
		return await pending;
	}
}
