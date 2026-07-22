/**
 * Configuration and reporting types for the child-process reaper.
 *
 * Split from childProcessReaper.ts to keep that file under the 300-line ceiling.
 */

import type { ProcessTableEntry, ProcessTableLister } from './processTable.ts';

/** How a reap decision was made — surfaced so the stale-table path is visible in the wild. */
export interface ReapDiagnostic {
	/** Age of the table the decision used. 0 for a fresh probe. */
	tableAgeMs: number;
	/** True when the final probe failed and the last good snapshot was used instead. */
	usedStaleTable: boolean;
}

export interface ChildProcessReaperOptions {
	/** Delay between an activity nudge (agent tool call) and its snapshot. Default 2s. */
	activityDelayMs?: number;
	/** First snapshot cadence after attach, before the backoff widens it. Default 500ms. */
	initialIntervalMs?: number;
	/** Ceiling the snapshot cadence backs off to. Default 10s. */
	intervalMs?: number;
	/** Injectable for tests. Defaults to the real liveness probe. */
	isAlive?: (pid: number) => boolean;
	/** Injectable for tests. Defaults to the real tree kill. */
	killTree?: (pid: number) => Promise<void>;
	/** Injectable for tests. Defaults to the real pid/ppid table lister. */
	listTable?: ProcessTableLister;
	/** Reports how the reap decided; the caller logs it. */
	onReap?: (diagnostic: ReapDiagnostic) => void;
	/** Injectable for tests. Defaults to the real platform. */
	platform?: NodeJS.Platform;
	/** Injectable for tests. Defaults to the real ancestry walk (one snapshot on Windows). */
	readAncestry?: (pid: number, maxHops: number) => Promise<ProcessTableEntry[]>;
	/** Injectable for tests. Defaults to the real single-pid lookup. */
	readEntry?: (pid: number) => Promise<null | ProcessTableEntry>;
	/**
	 * Oldest snapshot `reap()` will fall back on when its own probe fails. Beyond this the
	 * topology is too old to reason about and we leak, as before. Default 60s.
	 */
	staleTableMaxAgeMs?: number;
}
