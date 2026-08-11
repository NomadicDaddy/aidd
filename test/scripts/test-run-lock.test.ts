import { writeFile } from 'node:fs/promises';
import { describe, expect, test } from 'bun:test';
import {
	acquireTestRunLock,
	readActiveTestRun,
	testRunLockPath,
} from '../../scripts/lib/test-run-lock.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
async function makeRoot(): Promise<string> {
	return await testTempDir('aidd-test-run-lock-');
}

async function deadPid(): Promise<number> {
	const proc = Bun.spawn([process.execPath, '-e', ''], { windowsHide: true });
	await proc.exited;
	return proc.pid;
}

describe('test run lock', () => {
	test('acquire exposes the holder and blocks a second acquire until release', async () => {
		const root = await makeRoot();
		try {
			const lock = acquireTestRunLock(root);
			expect(lock).toBeDefined();
			expect(readActiveTestRun(root)?.pid).toBe(process.pid);
			expect(acquireTestRunLock(root)).toBeUndefined();

			lock!.release();
			expect(readActiveTestRun(root)).toBeUndefined();
			const reacquired = acquireTestRunLock(root);
			expect(reacquired).toBeDefined();
			reacquired!.release();
		} finally {
			await removeTempTree(root);
		}
	});

	test('a lock held by a dead pid is treated as stale and reclaimed', async () => {
		const root = await makeRoot();
		try {
			await writeFile(
				testRunLockPath(root),
				JSON.stringify({ pid: await deadPid(), rootDir: root, startedAt: Date.now() }),
			);
			expect(readActiveTestRun(root)).toBeUndefined();
			const lock = acquireTestRunLock(root);
			expect(lock).toBeDefined();
			lock!.release();
		} finally {
			await removeTempTree(root);
		}
	});

	test('an unparseable lock file is cleared instead of wedging the lock', async () => {
		const root = await makeRoot();
		try {
			await writeFile(testRunLockPath(root), 'not json');
			expect(readActiveTestRun(root)).toBeUndefined();
			const lock = acquireTestRunLock(root);
			expect(lock).toBeDefined();
			lock!.release();
		} finally {
			await removeTempTree(root);
		}
	});

	test('locks for different roots are independent', async () => {
		const rootA = await makeRoot();
		const rootB = await makeRoot();
		try {
			expect(testRunLockPath(rootA)).not.toBe(testRunLockPath(rootB));
			const lockA = acquireTestRunLock(rootA);
			const lockB = acquireTestRunLock(rootB);
			expect(lockA).toBeDefined();
			expect(lockB).toBeDefined();
			lockA!.release();
			lockB!.release();
		} finally {
			await removeTempTree(rootA);
			await removeTempTree(rootB);
		}
	});
});
