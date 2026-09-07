import { isProcessAlive } from 'aidd-shared/lib/processTree';
import {
	activeRunsDir,
	CLI_ACTIVE_RUN_STALE_MS,
	type CliActiveRunRecord,
} from 'aidd-shared/metadata/active-runs';
import { type FSWatcher, watch } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { webLogger } from '../../logger.ts';
import { persistRunLiveness, stopTail } from './heartbeatLiveness.ts';
import { markStale, reconcileRemovedRow, terminalize } from './heartbeatTransitions.ts';

// Mirror liveness to the run row at most this often per run (always on first sight or state
// change), so a multi-second heartbeat cadence does not amplify into a DB write per fs event.
const LIVENESS_PERSIST_THROTTLE_MS = 8_000;
// A non-terminal record whose tracked pid is dead is reaped once its heartbeat is at least this
// stale — a small grace so a process mid-exit (about to write its terminal heartbeat) is not
// raced into a spurious 'failed'.
const DEAD_PID_GRACE_MS = 10_000;
import {
	HEARTBEAT_POLL_FALLBACK_MS,
	type HeartbeatWatcherContext,
	STALE_SWEEP_INTERVAL_MS,
	TERMINAL_HEARTBEAT_STATES,
} from './heartbeatWatcherTypes.ts';
import { RunTailWatcher } from './tailWatcher.ts';

// Per-project directory watcher over .aidd/active-runs/. Translates filesystem-level
// transitions of CLI heartbeat records into DB updates, WebSocket broadcasts, and tail
// watcher lifecycle decisions for any run touching this project root — regardless of
// whether the launcher was web, director, or a direct CLI invocation. fs.watch is the
// primary signal; a 30s sweep catches missed events on filesystems where fs.watch is
// unreliable (WSL drvfs, NFS) or where a heartbeat goes stale silently.
export class HeartbeatWatcher {
	private readonly ctx: HeartbeatWatcherContext;
	private readonly projectPath: string;
	private readonly dir: string;
	private readonly lastSeenState = new Map<string, string>();
	private readonly lastPersistedHeartbeatAt = new Map<string, number>();
	private readonly fallbackTimer: ReturnType<typeof setInterval>;
	private readonly sweepTimer: ReturnType<typeof setInterval>;
	private debounceTimer: null | ReturnType<typeof setTimeout> = null;
	private stopped = false;
	private watcher: FSWatcher | null = null;
	private fsWatchFailed = false;

	private constructor(projectPath: string, ctx: HeartbeatWatcherContext) {
		this.projectPath = projectPath;
		this.ctx = ctx;
		this.dir = activeRunsDir(projectPath);
		this.fallbackTimer = setInterval(() => {
			if (this.fsWatchFailed) void this.scanSafely();
		}, HEARTBEAT_POLL_FALLBACK_MS);
		this.fallbackTimer.unref?.();
		this.sweepTimer = setInterval(() => {
			void this.scanSafely();
		}, STALE_SWEEP_INTERVAL_MS);
		this.sweepTimer.unref?.();
	}

	static async start(
		projectPath: string,
		ctx: HeartbeatWatcherContext,
	): Promise<HeartbeatWatcher> {
		const watcher = new HeartbeatWatcher(projectPath, ctx);
		await mkdir(watcher.dir, { recursive: true }).catch(() => {});
		watcher.installFsWatch();
		await watcher.scan();
		return watcher;
	}

	async stop(): Promise<void> {
		this.stopped = true;
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		clearInterval(this.fallbackTimer);
		clearInterval(this.sweepTimer);
		this.watcher?.close();
		this.watcher = null;
	}

	private installFsWatch(): void {
		try {
			this.watcher = watch(this.dir, { persistent: false }, () => this.scheduleScan());
			this.watcher.on('error', (err: unknown) => {
				webLogger.warn(
					{ err, projectPath: this.projectPath },
					'HeartbeatWatcher: fs.watch error; falling back to poll',
				);
				this.fsWatchFailed = true;
			});
		} catch (err) {
			webLogger.warn(
				{ err, projectPath: this.projectPath },
				'HeartbeatWatcher: fs.watch unavailable; using poll fallback',
			);
			this.fsWatchFailed = true;
		}
	}

	private scheduleScan(): void {
		if (this.stopped) return;
		if (this.debounceTimer) return;
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			void this.scanSafely();
		}, 50);
	}

	// All timer- and fs.watch-driven entry points funnel through here so a rejected
	// scan (e.g. a transient SQLITE_BUSY on a heartbeat terminalize) is logged and
	// contained instead of surfacing as an unhandled rejection that crashes the
	// entire control panel. Request-path callers use scan() directly.
	private async scanSafely(): Promise<void> {
		try {
			await this.scan();
		} catch (err) {
			webLogger.error(
				{ err, projectPath: this.projectPath },
				'HeartbeatWatcher: background scan failed',
			);
		}
	}

	private async scan(): Promise<void> {
		if (this.stopped) return;
		let entries: string[];
		try {
			entries = await readdir(this.dir);
		} catch {
			return;
		}
		const seenIds = new Set<string>();
		for (const entry of entries) {
			if (entry.endsWith('.tmp')) {
				await this.cleanupStaleTmp(entry);
				continue;
			}
			if (!entry.endsWith('.json')) continue;
			const id = entry.slice(0, -'.json'.length);
			seenIds.add(id);
			const record = await this.readRecord(id);
			if (!record) continue;
			await this.handleRecord(record);
		}
		// Heartbeat files that previously existed but are now gone — emit a deletion path.
		for (const id of [...this.lastSeenState.keys()]) {
			if (seenIds.has(id)) continue;
			this.lastSeenState.delete(id);
			await this.handleHeartbeatRemoved(id);
		}
	}

	// The CLI writes heartbeats atomically (write <id>.json.<pid>.<ts>.tmp, then rename). A crash
	// between the two strands the .tmp; the rename target is never observed, so it is pure litter.
	// Remove any that has outlived the stale window — recent ones may be a rename in flight.
	private async cleanupStaleTmp(entry: string): Promise<void> {
		const tmpPath = join(this.dir, entry);
		try {
			const stats = await stat(tmpPath);
			if (Date.now() - stats.mtimeMs <= CLI_ACTIVE_RUN_STALE_MS) return;
			await rm(tmpPath, { force: true });
		} catch {
			// Raced with the rename or another sweep — nothing to clean up.
		}
	}

	private async readRecord(id: string): Promise<CliActiveRunRecord | undefined> {
		try {
			const raw = await readFile(join(this.dir, `${id}.json`), 'utf8');
			return JSON.parse(raw) as CliActiveRunRecord;
		} catch {
			return undefined;
		}
	}

	private async handleRecord(record: CliActiveRunRecord): Promise<void> {
		const previous = this.lastSeenState.get(record.id);
		this.lastSeenState.set(record.id, record.state);
		if (TERMINAL_HEARTBEAT_STATES.has(record.state)) {
			this.lastPersistedHeartbeatAt.delete(record.id);
			await terminalize(this.ctx, record);
			return;
		}
		const now = Date.now();
		// Reap when the heartbeat has gone stale, or sooner when the tracked process is already
		// dead (a clean exit writes a terminal-state heartbeat first, handled above, so a dead pid
		// on a non-terminal record means the run died without finalizing). isProcessAlive uses
		// process.kill(pid, 0), which reliably reports dead PIDs as dead under Bun on both POSIX and
		// Windows (verified). Its known soft spots — PID reuse reading as alive, cross-user EPERM
		// reading as dead — are bounded either way by the dead-pid grace + null-pid wall-clock
		// fallback, so the liveness check is only ever a faster path to the same outcome for dead
		// pids, never the sole authority for live pids.
		//
		// CRITICAL: wall-clock staleness (heartbeatAge > CLI_ACTIVE_RUN_STALE_MS) is only fatal when
		// there is no pid to corroborate (pid is null) or the pid is provably dead. When a pid is
		// present and alive, a stale heartbeat does NOT fail the run — a laptop sleep, NTP step, or
		// container suspend can advance Date.now() past the staleness window while the process is
		// still alive and will resume heartbeating once the clock settles. Sweeping such a run to
		// 'failed' would be a false positive that kills a perfectly healthy long-running session.
		const pidDead = record.pid !== null && !isProcessAlive(record.pid);
		const heartbeatAge = now - record.heartbeatAt;
		if (
			(pidDead && heartbeatAge > DEAD_PID_GRACE_MS) ||
			(record.pid === null && heartbeatAge > CLI_ACTIVE_RUN_STALE_MS)
		) {
			this.lastPersistedHeartbeatAt.delete(record.id);
			await markStale(this.ctx, record);
			return;
		}
		if (!this.ctx.tailWatchers.has(record.id) && record.logPath) {
			try {
				const tail = await RunTailWatcher.start(record.id, record.logPath, this.ctx.hub);
				this.ctx.tailWatchers.set(record.id, tail);
			} catch (err) {
				webLogger.warn({ err, runId: record.id }, 'Failed to start tail watcher');
			}
		}
		// Mirror liveness onto the run row — always on first sight or a state change, otherwise at
		// most once per throttle window.
		const lastPersisted = this.lastPersistedHeartbeatAt.get(record.id);
		const stateChanged = previous !== record.state;
		if (
			lastPersisted === undefined ||
			stateChanged ||
			record.heartbeatAt - lastPersisted >= LIVENESS_PERSIST_THROTTLE_MS
		) {
			this.lastPersistedHeartbeatAt.set(record.id, record.heartbeatAt);
			await persistRunLiveness(this.ctx, record);
		}
	}

	// A heartbeat file vanished while we still track its id. In the normal terminal flow the row
	// was already driven to a terminal status (by our own terminalize, by ingest, or by boot
	// reconciliation) before the file was removed, so reconcileDeadRun no-ops via its
	// already-terminal guard. The case this closes is a file removed out from under a row still
	// marked `running` — the CLI writes heartbeats atomically (tmp + rename), so the file never
	// momentarily disappears during a normal update; an absence means the run is genuinely gone.
	private async handleHeartbeatRemoved(runId: string): Promise<void> {
		this.lastPersistedHeartbeatAt.delete(runId);
		await reconcileRemovedRow(this.ctx, runId);
		await stopTail(this.ctx, runId);
	}
}
