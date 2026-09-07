/**
 * Configuration and reporting types for the child-process reaper.
 *
 * Split from childProcessReaper.ts to keep that file under the 300-line ceiling.
 */

import type { ProcessTableEntry, ProcessTableLister } from './processTable.ts';

/**
 * One process a reap killed, with enough about it to audit the decision after the fact.
 *
 * A pid alone is unfalsifiable in a log: by the time anyone reads the line the number is gone, and
 * a reap that took down the wrong tree reads exactly like one that took down the right one. The
 * image name and the parent are what make a misattributed victim recognisable from the log alone.
 */
export interface ReapVictim {
	/** Executable name, when the platform's table reports one. */
	image?: string;
	pid: number;
	ppid: number;
}

/** How a reap decision was made — surfaced so the stale-table path is visible in the wild. */
export interface ReapDiagnostic {
	/** Age of the table the decision used. 0 for a fresh probe. */
	tableAgeMs: number;
	/** True when the final probe failed and the last good snapshot was used instead. */
	usedStaleTable: boolean;
	/** The processes killed as leaks, in kill order. Empty when the reap killed nothing. */
	victims: ReapVictim[];
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
	/**
	 * Pids that must survive the reap whatever the table says — the caller's launcher, and anything
	 * else whose death would take the run with it. This process and its ancestors are protected
	 * unconditionally; this is for the links an ancestry walk cannot be trusted to find.
	 */
	protectedPids?: readonly number[];
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
