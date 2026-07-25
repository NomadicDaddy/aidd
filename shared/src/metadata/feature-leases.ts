// Atomic cross-worktree feature leases. Concurrent runs against one project — each possibly in
// its own linked worktree with an independent `.aidd` metadata snapshot — coordinate feature
// selection through exclusive lease files under git's COMMON directory (`git rev-parse
// --git-common-dir`), which every linked worktree shares. Acquisition is exclusive file creation
// (`wx`) keyed by normalized feature id, so there is no read-modify-write window to race.
//
// In-process release (run completion, failure, parking) happens in the orchestrator's terminal
// writeRunSummary; for hard process deaths that skip finalization entirely, the release of
// record is the web orphan-run reap (activeRunSweep / activeRunReconcile), which deletes a dead
// run's leases by run id alongside its worktree reap. Acquisition additionally reclaims leases
// whose recorded pid is provably dead, so a crashed standalone CLI run — invisible to the web
// sweep — cannot deadlock a feature. A live run's lease is never reclaimed or reaped.

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { isProcessAlive } from '../lib/processTree.ts';

export interface FeatureLeaseRecord {
	acquiredAt: string;
	featureId: string;
	pid: number;
	runId: string;
}

export type FeatureLeaseAttempt =
	{ acquired: false; holder: FeatureLeaseRecord | null } | { acquired: true };

export interface FeatureLeaseService {
	/** Atomically acquire (or re-enter) the lease on a feature. Reentrant for this service's own
	 * runId; reclaims a lease whose recorded pid is provably dead. When the project is not a git
	 * repository the acquire trivially succeeds — without git there are no linked worktrees and
	 * no concurrent-run surface to guard. */
	acquire: (featureId: string) => Promise<FeatureLeaseAttempt>;
	/** Release every lease this run holds. Best-effort: never throws. */
	releaseAll: () => Promise<void>;
}

const LEASE_DIR_NAME = 'aidd-feature-leases';
const ACQUIRE_ATTEMPTS = 3;

/** Resolve the shared lease directory for a project: `<git common dir>/aidd-feature-leases`.
 * The common directory is shared by the main checkout and every linked worktree, so all
 * concurrent runs observe the same leases regardless of which checkout they execute in.
 * Returns null when the directory cannot be resolved (not a git repository, or git missing
 * from PATH — Bun.spawn throws ENOENT rather than exiting non-zero for an absent binary). */
export async function resolveFeatureLeaseDir(projectDir: string): Promise<null | string> {
	try {
		const proc = Bun.spawn(['git', '-C', projectDir, 'rev-parse', '--git-common-dir'], {
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
		const commonDir = stdout.trim();
		if (code !== 0 || commonDir === '') return null;
		// git prints a relative path (".git") when asked from the main checkout's root.
		return join(resolve(projectDir, commonDir), LEASE_DIR_NAME);
	} catch {
		return null;
	}
}

/** Filesystem key for a feature id: lowercased so ids differing only by case — which already
 * collide as feature directories on case-insensitive filesystems — map to one lease. */
function normalizeFeatureLeaseKey(featureId: string): string {
	return featureId.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
}

function leasePath(leaseDir: string, featureId: string): string {
	return join(leaseDir, `${normalizeFeatureLeaseKey(featureId)}.json`);
}

function parseLeaseRecord(raw: string): FeatureLeaseRecord | null {
	try {
		const parsed = JSON.parse(raw) as Partial<FeatureLeaseRecord>;
		if (typeof parsed.runId !== 'string' || typeof parsed.pid !== 'number') return null;
		return {
			acquiredAt: typeof parsed.acquiredAt === 'string' ? parsed.acquiredAt : '',
			featureId: typeof parsed.featureId === 'string' ? parsed.featureId : '',
			pid: parsed.pid,
			runId: parsed.runId,
		};
	} catch {
		return null;
	}
}

async function readLeaseRecord(path: string): Promise<FeatureLeaseRecord | null> {
	try {
		return parseLeaseRecord(await readFile(path, 'utf8'));
	} catch {
		return null;
	}
}

function isFsError(error: unknown, code: string): boolean {
	return (
		typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code
	);
}

export function createFeatureLeaseService(input: {
	pid: number;
	projectDir: string;
	runId: string;
}): FeatureLeaseService {
	let leaseDirPromise: Promise<null | string> | undefined;
	const leaseDir = (): Promise<null | string> =>
		(leaseDirPromise ??= resolveFeatureLeaseDir(input.projectDir));
	return {
		async acquire(featureId: string): Promise<FeatureLeaseAttempt> {
			const dir = await leaseDir();
			if (dir === null) return { acquired: true };
			return acquireLease(dir, featureId, input);
		},
		async releaseAll(): Promise<void> {
			const dir = await leaseDir();
			if (dir === null) return;
			await removeRunLeases(dir, input.runId);
		},
	};
}

async function acquireLease(
	leaseDir: string,
	featureId: string,
	owner: { pid: number; runId: string },
): Promise<FeatureLeaseAttempt> {
	const path = leasePath(leaseDir, featureId);
	await mkdir(leaseDir, { recursive: true });
	const record: FeatureLeaseRecord = {
		acquiredAt: new Date().toISOString(),
		featureId,
		pid: owner.pid,
		runId: owner.runId,
	};
	for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt++) {
		try {
			await writeFile(path, `${JSON.stringify(record, null, '\t')}\n`, { flag: 'wx' });
			return { acquired: true };
		} catch (err) {
			if (!isFsError(err, 'EEXIST')) throw err;
		}
		let raw: string;
		try {
			raw = await readFile(path, 'utf8');
		} catch (err) {
			// Holder released between our create and read — the path is free again; retry.
			if (isFsError(err, 'ENOENT')) continue;
			throw err;
		}
		const holder = parseLeaseRecord(raw);
		// Unparseable lease: almost certainly a concurrent writer mid-create. Treat it as held
		// by an unknown live run — skipping a feature for one selection pass is safe; stealing
		// a half-written live lease is not.
		if (holder === null) return { acquired: false, holder: null };
		if (holder.runId === owner.runId) return { acquired: true };
		if (isProcessAlive(holder.pid)) return { acquired: false, holder };
		const reclaim = await reclaimStaleLease(path, raw, `${path}.stale-${owner.pid}-${attempt}`);
		if (reclaim.outcome === 'displaced_live_lease') {
			return { acquired: false, holder: reclaim.holder };
		}
		// 'reclaimed': the path is free — retry the exclusive create. 'rename_failed': another
		// contender already quarantined the stale lease; retry and observe whatever won.
	}
	return { acquired: false, holder: await readLeaseRecord(path) };
}

export type StaleLeaseReclaim =
	| { holder: FeatureLeaseRecord | null; outcome: 'displaced_live_lease' }
	| { outcome: 'reclaimed' }
	| { outcome: 'rename_failed' };

/**
 * Remove a lease classified as stale, without destroying a live lease that raced into its place.
 *
 * A plain rename-then-delete is not enough: rename moves WHATEVER occupies the pathname, and
 * between the caller's read (which classified the holder as dead) and the rename, the stale
 * lease can be reclaimed by another contender and the path re-acquired by a live run — blind
 * removal would then destroy the live lease and re-open the double-selection this module exists
 * to prevent (two stealers racing over one dead holder is enough to hit this; no sweep needed).
 *
 * So: quarantine via atomic rename, then VERIFY the quarantined bytes are the lease that was
 * classified. On mismatch the displaced record is restored with an exclusive create (the path
 * may have been taken yet again while quarantined) and reported as the holder, so the caller
 * skips the feature. The residual window — the restore's `wx` losing to a fourth contender — is
 * accepted as pathological; the displaced holder is still reported, so selection stays blocked
 * either way. Exported for direct interleaving tests, which cannot drive this window through
 * the public acquire path.
 */
export async function reclaimStaleLease(
	path: string,
	classifiedRaw: string,
	quarantinePath: string,
): Promise<StaleLeaseReclaim> {
	try {
		await rename(path, quarantinePath);
	} catch {
		return { outcome: 'rename_failed' };
	}
	let quarantined: null | string;
	try {
		quarantined = await readFile(quarantinePath, 'utf8');
	} catch {
		quarantined = null;
	}
	if (quarantined !== null && quarantined !== classifiedRaw) {
		await writeFile(path, quarantined, { flag: 'wx' }).catch(() => {});
		await rm(quarantinePath, { force: true }).catch(() => {});
		return { holder: parseLeaseRecord(quarantined), outcome: 'displaced_live_lease' };
	}
	await rm(quarantinePath, { force: true }).catch(() => {});
	return { outcome: 'reclaimed' };
}

async function removeRunLeases(leaseDir: string, runId: string): Promise<number> {
	let names: string[];
	try {
		names = await readdir(leaseDir);
	} catch {
		return 0;
	}
	let removed = 0;
	for (const name of names) {
		if (!name.endsWith('.json')) continue;
		const path = join(leaseDir, name);
		const record = await readLeaseRecord(path);
		if (record === null || record.runId !== runId) continue;
		try {
			await rm(path, { force: true });
			removed++;
		} catch {
			// Best-effort: a lease that cannot be removed now is reclaimed later by the
			// pid-liveness check at the next acquisition.
		}
	}
	return removed;
}

/** Delete every lease owned by a run already determined dead. Called from the EXISTING web
 * orphan-run reap paths (activeRunSweep and boot-time activeRunReconcile) alongside the
 * worktree reap — the release of record when a hard process death skipped in-process release.
 * Keyed strictly by run id, so a live run's leases are never touched. Best-effort; returns the
 * number of leases removed. */
export async function reapRunFeatureLeases(projectDir: string, runId: string): Promise<number> {
	const leaseDir = await resolveFeatureLeaseDir(projectDir);
	if (leaseDir === null) return 0;
	return removeRunLeases(leaseDir, runId);
}
