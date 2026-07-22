import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';

import { webLogger } from '../logger.ts';

// Single-writer guard for the control-panel database. SQLite with WAL tolerates concurrent
// readers, but aidd's design assumes exactly one process owns the write path (run/telemetry/
// director state flows through it). A second backend pointed at the same data directory
// would interleave writes and defeat the reconciliation invariants. This is an advisory lock:
// a sidecar file next to the .db that records the owning pid. It is acquired on startup and
// released on shutdown, with liveness checks so a crashed backend's stale lock self-heals.

export interface WriterLock {
	readonly path: string;
	/** Idempotently release the lock if this process still owns it. */
	release(): void;
}

// Locks held by THIS process, keyed by canonical lock path. An on-disk lock bearing our own
// pid is otherwise indistinguishable from a stale leftover, so the disk check alone cannot
// stop a second acquisition inside the same process. This registry is the authoritative
// in-process owner set: a path already present here is a genuine double-acquire and is rejected.
const heldLocks = new Set<string>();

interface LockPayload {
	host: string;
	pid: number;
	startedAt: number;
}

type LockReadResult =
	| { ageMs: number; kind: 'invalid'; reason: string }
	| { kind: 'missing' }
	| { kind: 'owned'; payload: LockPayload };

const LOCK_ACQUIRE_ATTEMPTS = 10;
const LOCK_RETRY_DELAY_MS = 25;
const INVALID_LOCK_RECLAIM_GRACE_MS = 2_000;

function sleepSync(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		// Signal 0 performs error checking without delivering a signal.
		process.kill(pid, 0);
		return true;
	} catch (err) {
		// ESRCH = no such process. EPERM = process exists but we may not signal it (still alive).
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/**
 * Maximum plausible age for a writer lock before it is treated as stale. The lock is
 * released on orderly shutdown and on crash-exit (process.once('exit')), so a lock that
 * has persisted this long without being reclaimed is almost certainly from a process
 * that died without running its exit handler (SIGKILL, power loss) and whose PID was
 * subsequently recycled by the OS. 30 days is well beyond any realistic single-process
 * uptime for the control panel.
 */
const MAX_PLAUSIBLE_LOCK_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Corroborate a lock payload's recorded host and startedAt before treating a live PID
 * as proof the lock is genuinely held. Without this corroboration, OS PID reuse on a
 * different host or after a reboot (where the old holder died and the OS recycled the
 * PID for an unrelated process) could block startup indefinitely.
 *
 * @returns `true` if both the host matches AND the startedAt is plausible (not zero
 *          and not older than the maximum plausible lock age).
 */
function isLockCorroborated(payload: LockPayload): boolean {
	// Host must match — a PID that is alive on a different hostname (or in a different
	// PID namespace under WSL/containers where hostname() diverges) cannot be the
	// original holder.
	if (payload.host !== hostname()) return false;
	// startedAt must be present and plausible. A zero startedAt means the field was
	// missing from an old-format lock; in that case we cannot corroborate and fall back
	// to the host+PID check only. A non-zero startedAt that predates the maximum
	// plausible lock age indicates the original process died long ago.
	if (payload.startedAt === 0) return true;
	const ageMs = Date.now() - payload.startedAt;
	if (ageMs > MAX_PLAUSIBLE_LOCK_AGE_MS) return false;
	return true;
}

function invalidLock(lockPath: string, reason: string): LockReadResult {
	let ageMs: number;
	try {
		ageMs = Math.max(0, Date.now() - statSync(lockPath).mtimeMs);
	} catch {
		ageMs = 0;
	}
	return { ageMs, kind: 'invalid', reason };
}

function readLock(lockPath: string): LockReadResult {
	try {
		const raw = readFileSync(lockPath, 'utf8');
		if (raw.trim() === '') return invalidLock(lockPath, 'empty');
		const parsed = JSON.parse(raw) as Partial<LockPayload>;
		if (typeof parsed.pid !== 'number') return invalidLock(lockPath, 'missing pid');
		return {
			kind: 'owned',
			payload: {
				host: typeof parsed.host === 'string' ? parsed.host : 'unknown',
				pid: parsed.pid,
				startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : 0,
			},
		};
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
		return invalidLock(lockPath, 'unreadable or malformed');
	}
}

function writeLockExclusive(lockPath: string): boolean {
	const payload: LockPayload = { host: hostname(), pid: process.pid, startedAt: Date.now() };
	try {
		// 'wx' = create-and-write, failing atomically if the file already exists. This is the
		// race-resolution primitive: if two backends start at once, exactly one create wins.
		writeFileSync(lockPath, `${JSON.stringify(payload)}\n`, { flag: 'wx' });
		return true;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
		throw err;
	}
}

/**
 * Acquire the writer lock for the given database file. Throws if another live backend already
 * holds it. Reclaims the lock automatically if the previous holder died without releasing.
 */
export function acquireWriterLock(dbPath: string): WriterLock {
	const lockPath = resolve(`${dbPath}.lock`);
	// Authoritative in-process check first: an on-disk lock with our own pid is ambiguous
	// (stale leftover vs. a live sibling acquisition), but the registry is not.
	if (heldLocks.has(lockPath)) {
		throw new Error(
			`This process already holds the database writer lock at ${lockPath}. Only one backend ` +
				`writer may run per process against ${dbPath}.`
		);
	}
	let acquired = false;
	for (let attempt = 0; attempt < LOCK_ACQUIRE_ATTEMPTS && !acquired; attempt++) {
		if (writeLockExclusive(lockPath)) {
			acquired = true;
			break;
		}
		const holder = readLock(lockPath);
		if (holder.kind === 'missing') continue;
		if (holder.kind === 'invalid') {
			if (holder.ageMs < INVALID_LOCK_RECLAIM_GRACE_MS) {
				sleepSync(LOCK_RETRY_DELAY_MS);
				continue;
			}
			webLogger.warn(
				{ ageMs: holder.ageMs, lockPath, reason: holder.reason },
				'Reclaiming stale unreadable database writer lock'
			);
			rmSync(lockPath, { force: true });
			continue;
		}
		const payload = holder.payload;
		// A different live PID is only treated as genuinely held when the lock is
		// corroborated by a matching hostname and a plausible startedAt. Without this
		// check, OS PID reuse on a different host or after a reboot could leave a stale
		// lock blocking startup forever — process.kill reports the recycled PID as alive
		// even though the original holder is long gone.
		if (
			payload.pid !== process.pid &&
			isProcessAlive(payload.pid) &&
			isLockCorroborated(payload)
		) {
			// A different live backend owns it — fatal. (A genuine same-process double-acquire
			// was already rejected by the heldLocks check above; an on-disk lock carrying our
			// own pid that is NOT in heldLocks can only be a stale leftover from a crashed prior
			// process whose pid the OS later reused, so it falls through to reclaim.)
			throw new Error(
				`Another aidd backend (pid ${payload.pid} on ${payload.host}) already holds the database ` +
					`writer lock at ${lockPath}. Only one backend may write to ${dbPath} at a time. Stop ` +
					'the other instance (bun run stop:web) before starting a new one.'
			);
		}
		// Holder is dead or a reused-pid leftover: clear the stale lock and retry.
		webLogger.warn(
			{ holder: payload, lockPath },
			'Reclaiming stale database writer lock from a dead holder'
		);
		rmSync(lockPath, { force: true });
	}
	if (!acquired) {
		throw new Error(
			`Failed to acquire database writer lock at ${lockPath} after ${LOCK_ACQUIRE_ATTEMPTS} attempts; ` +
				'another backend may be starting concurrently.'
		);
	}
	heldLocks.add(lockPath);

	let released = false;
	const removeIfOwned = (): void => {
		heldLocks.delete(lockPath);
		const holder = readLock(lockPath);
		// Never clobber a lock a different live backend may have legitimately re-acquired.
		if (
			holder.kind === 'missing' ||
			(holder.kind === 'owned' && holder.payload.pid === process.pid)
		) {
			rmSync(lockPath, { force: true });
		}
	};
	// Synchronous backstop for crash exits (uncaughtException -> process.exit) where the
	// orderly shutdown path never runs. Must stay sync — 'exit' handlers cannot await.
	const onExit = (): void => {
		if (released) return;
		released = true;
		removeIfOwned();
	};
	process.once('exit', onExit);

	return {
		path: lockPath,
		release(): void {
			if (released) return;
			released = true;
			process.removeListener('exit', onExit);
			removeIfOwned();
		},
	};
}
