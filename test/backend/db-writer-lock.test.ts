import { existsSync } from 'node:fs';
import { readFile, utimes, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { acquireWriterLock } from '../../backend/src/db/writerLock.ts';

import { testTempDir } from '../_helpers/temp.ts';
// A pid far above any real process: process.kill(pid, 0) throws (ESRCH/EINVAL), so the lock's
// liveness probe deterministically treats it as dead. Used to exercise stale-lock reclaim
// without the pid-reuse flakiness of spawning-then-killing a child.
const DEAD_PID = 2_147_483_646;

async function tempDbPath(): Promise<string> {
	const dir = await testTempDir('aidd-writerlock-');
	return join(dir, 'aidd-panel.db');
}

describe('acquireWriterLock', () => {
	test('writes a pid-stamped sidecar on acquire and removes it on release', async () => {
		const dbPath = await tempDbPath();
		const lock = acquireWriterLock(dbPath);
		expect(existsSync(lock.path)).toBe(true);
		const payload = JSON.parse(await readFile(lock.path, 'utf8')) as { pid: number };
		expect(payload.pid).toBe(process.pid);
		lock.release();
		expect(existsSync(lock.path)).toBe(false);
	});

	test('release is idempotent and the lock can be re-acquired afterwards', async () => {
		const dbPath = await tempDbPath();
		const first = acquireWriterLock(dbPath);
		first.release();
		first.release(); // second release must not throw
		const second = acquireWriterLock(dbPath);
		expect(existsSync(second.path)).toBe(true);
		second.release();
	});

	test('rejects a second acquisition from the same process', async () => {
		const dbPath = await tempDbPath();
		const lock = acquireWriterLock(dbPath);
		try {
			expect(() => acquireWriterLock(dbPath)).toThrow(
				/already holds the database writer lock/
			);
		} finally {
			lock.release();
		}
	});

	test('reclaims a stale lock whose recorded pid is dead', async () => {
		const dbPath = await tempDbPath();
		const lockPath = `${dbPath}.lock`;
		await writeFile(
			lockPath,
			JSON.stringify({ host: 'crashed-host', pid: DEAD_PID, startedAt: 1 })
		);
		const lock = acquireWriterLock(dbPath); // must reclaim rather than throw
		const payload = JSON.parse(await readFile(lock.path, 'utf8')) as { pid: number };
		expect(payload.pid).toBe(process.pid);
		lock.release();
	});

	test('does not reclaim a fresh unreadable lock while another backend may be writing it', async () => {
		const dbPath = await tempDbPath();
		const lockPath = `${dbPath}.lock`;
		await writeFile(lockPath, '');
		expect(() => acquireWriterLock(dbPath)).toThrow(/Failed to acquire database writer lock/);
		expect(existsSync(lockPath)).toBe(true);
	});

	test('reclaims an old unreadable lock after the startup grace window', async () => {
		const dbPath = await tempDbPath();
		const lockPath = `${dbPath}.lock`;
		await writeFile(lockPath, '{');
		const staleTime = new Date(Date.now() - 3_000);
		await utimes(lockPath, staleTime, staleTime);
		const lock = acquireWriterLock(dbPath);
		const payload = JSON.parse(await readFile(lock.path, 'utf8')) as { pid: number };
		expect(payload.pid).toBe(process.pid);
		lock.release();
	});

	test('rejects when a different live process holds the lock', async () => {
		const dbPath = await tempDbPath();
		const lockPath = `${dbPath}.lock`;
		// A real, live pid that is not ours: a child that sleeps until we kill it.
		const child = Bun.spawn(['bun', '-e', 'setTimeout(() => {}, 60_000)'], {
			windowsHide: true,
		});
		try {
			await writeFile(
				lockPath,
				// Corroborated payload: matching hostname and a plausible startedAt so the
				// corroboration check treats the live PID as a genuine holder.
				JSON.stringify({ host: hostname(), pid: child.pid, startedAt: Date.now() })
			);
			expect(() => acquireWriterLock(dbPath)).toThrow(/Another aidd backend/);
		} finally {
			child.kill();
			await child.exited;
		}
	});

	test('reclaims a stale lock whose pid is alive but host does not match', async () => {
		// OS PID reuse on a different host (or container/WSL hostname divergence) should
		// NOT block startup: the corroboration check catches the host mismatch and reclaims.
		const dbPath = await tempDbPath();
		const lockPath = `${dbPath}.lock`;
		const child = Bun.spawn(['bun', '-e', 'setTimeout(() => {}, 60_000)'], {
			windowsHide: true,
		});
		try {
			await writeFile(
				lockPath,
				JSON.stringify({
					host: 'a-completely-different-host',
					pid: child.pid,
					startedAt: Date.now(),
				})
			);
			const lock = acquireWriterLock(dbPath); // must reclaim rather than throw
			const payload = JSON.parse(await readFile(lock.path, 'utf8')) as { pid: number };
			expect(payload.pid).toBe(process.pid);
			lock.release();
		} finally {
			child.kill();
			await child.exited;
		}
	});

	test('reclaims a stale lock whose startedAt is implausibly old', async () => {
		// A lock acquired before system boot (e.g. the holder died and PID was recycled
		// after a reboot) must be reclaimed even if the PID is alive and the host matches.
		const dbPath = await tempDbPath();
		const lockPath = `${dbPath}.lock`;
		const child = Bun.spawn(['bun', '-e', 'setTimeout(() => {}, 60_000)'], {
			windowsHide: true,
		});
		try {
			await writeFile(
				lockPath,
				JSON.stringify({
					host: hostname(),
					pid: child.pid,
					startedAt: Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago
				})
			);
			const lock = acquireWriterLock(dbPath);
			const payload = JSON.parse(await readFile(lock.path, 'utf8')) as { pid: number };
			expect(payload.pid).toBe(process.pid);
			lock.release();
		} finally {
			child.kill();
			await child.exited;
		}
	});
});
