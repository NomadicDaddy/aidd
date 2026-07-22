import { confirmLiveIdentity, identityMatches } from './childReaperIdentity.ts';
import { type ChildProcessReaperOptions, type ReapDiagnostic } from './childReaperOptions.ts';
import { extendDescendants } from './childReaperTracking.ts';
import {
	listProcessTable,
	readProcessAncestry,
	readProcessEntry,
	parsePidPpidTable,
	type ProcessTableEntry,
	type ProcessTableLister,
} from './processTable.ts';
import { isProcessAlive, killProcessTree } from './processTree.ts';

export { parsePidPpidTable, type ProcessTableEntry, type ProcessTableLister };
export { type ChildProcessReaperOptions, type ReapDiagnostic } from './childReaperOptions.ts';

// Tracks the process tree an agent backend spawns during an iteration so the orchestrator can reap
// survivors at teardown: a step that starts a dev/verification server and exits without stopping it
// leaves that server holding its port, and later boots then fail with "address in use". Parent-exit
// cascades do not cover it (Windows breakaway spawns escape the job object; POSIX detached
// grandchildren leave the process group), so we sample the pid/ppid table while the backend runs,
// remember every transitive descendant, and kill the survivors once it exits. Probing lives in
// processTable.ts.

export class ChildProcessReaper {
	private readonly activityDelayMs: number;
	private activityTimer: ReturnType<typeof setTimeout> | undefined;
	/** pid -> row recorded at first observation; retains dead pids so links outlive parents. */
	private readonly descendants = new Map<number, ProcessTableEntry>();
	private readonly initialIntervalMs: number;
	private readonly intervalMs: number;
	/** Current cadence; starts dense and backs off toward intervalMs. See scheduleNext. */
	private nextIntervalMs: number;
	private readonly isAlive: (pid: number) => boolean;
	private readonly killTree: (pid: number) => Promise<void>;
	private readonly listTable: ProcessTableLister;
	private readonly readEntry: (pid: number) => Promise<null | ProcessTableEntry>;
	private readonly platform: NodeJS.Platform;
	private readonly readAncestry: (pid: number, maxHops: number) => Promise<ProcessTableEntry[]>;
	private rootPid: number | undefined;
	/** The root's row as first observed; the identity the root kill is checked against. */
	private rootRow: ProcessTableEntry | undefined;
	/** The in-flight root verification started by attach(); reap() awaits it before deciding. */
	private rootVerification: Promise<void> | undefined;
	/**
	 * Latched once the root is proven to be this process or one of its descendants. Reaping is
	 * refused until then: an unverified root pid would aim the descendant walk, and the kills, at an
	 * unrelated process tree.
	 */
	private rootVerified = false;
	/** Bumped per probe, so a settling probe only retires the in-flight slot if it still owns it. */
	private probeGeneration = 0;
	/** In-flight probe, shared by concurrent callers so a slow table is paid for once. */
	private snapshotInFlight: Promise<null | ProcessTableEntry[]> | undefined;
	private stopped = false;
	private timer: ReturnType<typeof setTimeout> | undefined;
	/** Last successful snapshot, kept so a failed final probe can still reap. */
	private lastTable: { at: number; rows: ProcessTableEntry[] } | undefined;
	private readonly onReap: ((diagnostic: ReapDiagnostic) => void) | undefined;
	private readonly staleTableMaxAgeMs: number;

	constructor(options: ChildProcessReaperOptions = {}) {
		this.activityDelayMs = options.activityDelayMs ?? 2_000;
		this.initialIntervalMs = options.initialIntervalMs ?? 500;
		this.intervalMs = options.intervalMs ?? 10_000;
		this.nextIntervalMs = Math.min(this.initialIntervalMs, this.intervalMs);
		this.isAlive = options.isAlive ?? isProcessAlive;
		this.killTree = options.killTree ?? ((pid) => killProcessTree(pid));
		this.listTable = options.listTable ?? listProcessTable;
		this.readAncestry = options.readAncestry ?? readProcessAncestry;
		this.readEntry = options.readEntry ?? readProcessEntry;
		this.onReap = options.onReap;
		this.platform = options.platform ?? process.platform;
		this.staleTableMaxAgeMs = options.staleTableMaxAgeMs ?? 60_000;
	}

	/**
	 * Probe the table, coalescing concurrent callers onto one in-flight probe so a slow scan is
	 * paid for once. Deliberately NOT a time-based freshness cache: handing a "recent enough" table
	 * to a scheduled snapshot starves the sampling the reaper is built on, since descendants are
	 * only discoverable while their short-lived intermediates are alive, and a skipped sample is a
	 * leak that never gets linked to the root.
	 */
	private async probe(force = false): Promise<null | ProcessTableEntry[]> {
		// force means "a snapshot taken after this moment". Joining an in-flight probe would not
		// do: the one already running may have started before the backend spawned the child we
		// are about to look for, and a descendant missing from the table is a descendant that
		// never gets reaped.
		if (!force && this.snapshotInFlight) return await this.snapshotInFlight;

		// Stamp the age from when the scan STARTED, not when it returned. The rows describe the
		// machine at the moment the table was read, and the read itself can take seconds on the
		// PowerShell fallback — crediting it with the finish time would call a 3s-old table fresh
		// and understate it against staleTableMaxAgeMs, which is the budget that decides whether the
		// topology is still worth trusting.
		const startedAt = Date.now();
		const generation = (this.probeGeneration += 1);
		const pending = (async () => {
			try {
				const table = await this.listTable();
				if (table) this.lastTable = { at: startedAt, rows: table };
				return table;
			} finally {
				// Only retire the slot if a later (forced) probe has not already claimed it. Clearing
				// it unconditionally let an earlier probe settling second wipe the forced probe's
				// entry, so the next caller started a third scan instead of joining the live one.
				if (this.probeGeneration === generation) this.snapshotInFlight = undefined;
			}
		})();
		this.snapshotInFlight = pending;
		return await pending;
	}

	/** Start tracking descendants of the backend process. Idempotent; first pid wins. */
	attach(rootPid: number): void {
		if (this.rootPid !== undefined || this.stopped) return;
		this.rootPid = rootPid;
		// Kept, not discarded: reap() joins it. A short iteration can reach teardown before
		// verification lands, and reap() reads rootVerified — so firing this and forgetting it made
		// a fast run silently reap nothing, which is the very race verifying from a single-pid read
		// was meant to win.
		this.rootVerification = this.verifyRoot(rootPid);
		void this.snapshot();
		this.scheduleNext();
	}

	/**
	 * Prove the root is ours from single-pid reads instead of a whole-table scan. rootVerified gates
	 * every kill, and latching it from the table is a race the reaper loses in the case it exists
	 * for: a backend that starts its server and exits within a second is gone before the scan
	 * returns, so its row never appears and reap() does nothing. The table stays as the fallback.
	 */
	private async verifyRoot(rootPid: number): Promise<void> {
		if (this.rootVerified) return;
		if (rootPid === process.pid) {
			this.rootVerified = true;
			return;
		}

		// Walk up to us rather than demanding a direct child: a backend spawned through a wrapper (a
		// runner shim, a shell) has some other immediate parent, and would never verify. Reaching this
		// process by ancestry still proves the tree is ours. Bounded, so a corrupt table cannot loop.
		const chain = await this.readAncestry(rootPid, 8);
		// The chain starts at the root, so its first row IS the root's. Remember it: reap() kills the
		// root's tree, and that kill needs an identity to check the live pid against.
		const [rootRow] = chain;
		if (rootRow !== undefined) this.rootRow ??= rootRow;

		for (const entry of chain) {
			if (entry.ppid === process.pid) {
				this.rootVerified = true;
				return;
			}
		}
	}

	/**
	 * Nudge a near-term snapshot. Called on agent tool activity: dev servers spawn through
	 * short-lived intermediate shells (bash -> bun start -> server), and the pid/ppid links only
	 * exist while those intermediates are alive, so sampling right after a tool call catches
	 * chains the periodic cadence would miss.
	 */
	noteActivity(): void {
		if (this.rootPid === undefined || this.stopped || this.activityTimer !== undefined) return;
		this.activityTimer = setTimeout(() => {
			this.activityTimer = undefined;
			void this.snapshot();
		}, this.activityDelayMs);
		this.activityTimer.unref();
	}

	/**
	 * Kill every tracked descendant that is still alive after the backend exited. Takes a final
	 * snapshot first so short iterations still discover their leaks. Returns the pids reaped.
	 */
	async reap(): Promise<number[]> {
		this.stop();
		if (this.rootPid === undefined) return [];

		// Join the verification attach() started. Every kill below is gated on rootVerified, so
		// reading it while the walk is still in flight would decide "not ours" on a technicality
		// and reap nothing.
		await this.rootVerification;

		// Force a fresh probe: a snapshot taken before the backend exited can still show the
		// leaked child parented to a live intermediate, and the identity check wants current rows.
		const fresh = await this.probe(true);
		if (fresh) this.extend(fresh);

		// Fall back to the last good snapshot when the probe fails. A timeout here is precisely
		// when the leak matters, and the start-time token in the recorded rows makes pid reuse -
		// the only real hazard of stale data - detectable. Past staleTableMaxAgeMs the topology is
		// too old to reason about, so we leak, as before.
		const cached = this.lastTable;
		const stale = fresh === null && cached !== undefined;
		const tableAgeMs = stale && cached ? Date.now() - cached.at : 0;
		const usable =
			fresh ?? (stale && tableAgeMs <= this.staleTableMaxAgeMs ? cached?.rows : undefined);

		this.onReap?.({ tableAgeMs, usedStaleTable: stale && usable !== undefined });

		if (!this.rootVerified || usable === undefined) return [];
		const currentRows = new Map<number, ProcessTableEntry>();
		for (const entry of usable) currentRows.set(entry.pid, entry);
		const usedStale = stale && usable !== undefined;

		// Abort paths kill the live tree already; this retry covers a root that survived it. The
		// root is never in `descendants`, so it gets its identity check here: rootVerified was
		// latched at attach, possibly minutes ago, and proves the pid was ours *then*. Killing on
		// liveness alone would tree-kill whatever inherited the number if the root has since died.
		if (this.rootPid !== process.pid && this.isAlive(this.rootPid)) {
			const recordedRoot = this.rootRow;
			// With no token to compare (never seen in a table, or a table that carries none) there
			// is nothing to check against, and the root is a pid we verified as ours: kill it, as
			// before. Where a token exists, it must still match a read taken now.
			const rootIsOurs =
				recordedRoot?.startId === undefined
					? true
					: await confirmLiveIdentity(this.rootPid, recordedRoot, this.readEntry);
			if (rootIsOurs) await this.killTree(this.rootPid);
		}

		// Decide the victim set before killing anything: a tree kill can take a later victim's
		// recorded parent down with it, which would flip that victim's identity check mid-loop.
		const victims: number[] = [];
		for (const [pid, recorded] of this.descendants) {
			if (pid === process.pid || pid === this.rootPid || pid <= 1) continue;
			if (!this.isAlive(pid)) continue;
			// A stale table is as old as `recorded` is, so matching one against the other says
			// nothing about now - it compares two past snapshots and calls the agreement proof.
			// Re-read the pid instead: that is the only read that postdates the process's death,
			// and death-then-reuse is the whole hazard. (Reuse is likeliest precisely here: the
			// probe timed out because the box is loaded.)
			const confirmed = usedStale
				? await confirmLiveIdentity(pid, recorded, this.readEntry)
				: identityMatches(recorded, currentRows.get(pid), this.platform, this.isAlive);
			if (!confirmed) continue;
			victims.push(pid);
		}
		for (const pid of victims) await this.killTree(pid);
		return victims;
	}

	/** Sample the process table and extend the tracked descendant set. */
	async snapshot(): Promise<void> {
		if (this.rootPid === undefined) return;
		const table = await this.probe();
		if (table) this.extend(table);
	}

	stop(): void {
		this.stopped = true;
		if (this.timer !== undefined) clearTimeout(this.timer);
		if (this.activityTimer !== undefined) clearTimeout(this.activityTimer);
		this.timer = undefined;
		this.activityTimer = undefined;
	}

	/** Pids currently tracked as descendants of the root (test observability). */
	trackedPids(): number[] {
		return [...this.descendants.keys()];
	}

	private extend(table: ProcessTableEntry[]): void {
		const { descendants, rootPid, rootRow, rootVerified } = this;
		if (rootPid === undefined) return;
		const state = { descendants, rootPid, rootRow, rootVerified };
		({ rootRow: this.rootRow, rootVerified: this.rootVerified } = extendDescendants(
			state,
			table
		));
	}

	/**
	 * Sample densely at first, then back off to the steady cadence.
	 *
	 * A leaked server is only linkable to the run while the intermediate that spawned it (a shell, a
	 * start script) is still alive — a window of a second or two, since the whole point of an
	 * intermediate is to exit. Miss it and the child is re-parented to init, its ppid no longer names
	 * anything we track, and no later snapshot can reconstruct the chain: the leak is unreapable.
	 * A flat 10s cadence loses that race routinely. The probe is cheap enough now (Toolhelp on
	 * Windows, /proc elsewhere) to sample every half-second early, and long iterations still settle
	 * to the steady cadence rather than polling the table forever.
	 */
	private scheduleNext(): void {
		if (this.stopped) return;
		const delay = this.nextIntervalMs;
		this.nextIntervalMs = Math.min(this.intervalMs, Math.round(delay * 1.5));
		this.timer = setTimeout(() => {
			void this.snapshot().finally(() => {
				this.scheduleNext();
			});
		}, delay);
		this.timer.unref();
	}
}
