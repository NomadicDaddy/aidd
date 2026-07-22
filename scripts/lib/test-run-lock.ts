import { createHash } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface TestRunLockRecord {
	pid: number;
	rootDir: string;
	startedAt: number;
	/**
	 * Pid of the `bun test` process the lock holder spawned (scripts/run-tests.ts). Parallel
	 * workers are that process's direct children, so a worker proves it belongs to the owned
	 * run by matching this against its own process.ppid — no environment inheritance needed
	 * (Bun.spawn does not propagate runtime process.env mutations).
	 */
	testParentPid?: number;
}

interface TestRunLockHandle {
	release(): void;
}

// Shared identity for everything that is scoped per repository root (the run lock, the
// test temp tree). Lock and temp-tree boundaries MUST agree: a sweep may only touch
// trees whose owning lock it can observe.
function repoRootKey(rootDir: string): string {
	return createHash('sha256').update(resolve(rootDir).toLowerCase()).digest('hex').slice(0, 16);
}

function testRunLockPathForKey(key: string): string {
	return join(tmpdir(), `aidd-test-run-${key}.lock`);
}

// One lock file per repository root, kept in the OS temp dir so it never shows up in
// git status. Concurrent `bun test` runs for the SAME root corrupt shared fixtures
// (.tmp-orchestrator-tests/, ports, temp trees); runs rooted elsewhere are unrelated.
function testRunLockPath(rootDir: string): string {
	return testRunLockPathForKey(repoRootKey(rootDir));
}

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		// EPERM means the process exists but belongs to another user.
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
}

function readActiveTestRunByKey(key: string): TestRunLockRecord | undefined {
	const path = testRunLockPathForKey(key);
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch {
		return undefined;
	}
	let record: TestRunLockRecord | undefined;
	try {
		record = JSON.parse(raw) as TestRunLockRecord;
	} catch {
		record = undefined;
	}
	if (record !== undefined && typeof record.pid === 'number' && isPidAlive(record.pid)) {
		return record;
	}
	// Unparseable or held by a dead pid — a crashed run left it behind; clear it.
	try {
		unlinkSync(path);
	} catch {
		// Raced with another cleaner; the next read settles it.
	}
	return undefined;
}

function readActiveTestRun(rootDir: string): TestRunLockRecord | undefined {
	return readActiveTestRunByKey(repoRootKey(rootDir));
}

// Records the spawned `bun test` pid on a lock this process holds, so that run's parallel
// workers can recognize the lock as their own (see TestRunLockRecord.testParentPid).
function markTestRunChild(rootDir: string, testParentPid: number): void {
	const path = testRunLockPath(rootDir);
	try {
		const current = JSON.parse(readFileSync(path, 'utf8')) as TestRunLockRecord;
		if (current.pid !== process.pid) return;
		writeFileSync(path, JSON.stringify({ ...current, testParentPid }));
	} catch {
		// Lock vanished or is unreadable; the workers will refuse and the run fails loudly.
	}
}

function acquireTestRunLock(rootDir: string): TestRunLockHandle | undefined {
	const path = testRunLockPath(rootDir);
	const record: TestRunLockRecord = {
		pid: process.pid,
		rootDir: resolve(rootDir),
		startedAt: Date.now(),
	};
	// Two attempts: the first failure may be a stale lock, which readActiveTestRun clears.
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			writeFileSync(path, JSON.stringify(record), { flag: 'wx' });
		} catch {
			if (readActiveTestRun(rootDir) !== undefined) return undefined;
			continue;
		}
		return {
			release() {
				try {
					const current = JSON.parse(readFileSync(path, 'utf8')) as TestRunLockRecord;
					if (current.pid === process.pid) unlinkSync(path);
				} catch {
					// Already gone or replaced by a newer run — nothing to release.
				}
			},
		};
	}
	return undefined;
}

export {
	acquireTestRunLock,
	markTestRunChild,
	readActiveTestRun,
	readActiveTestRunByKey,
	repoRootKey,
	testRunLockPath,
};
export type { TestRunLockHandle, TestRunLockRecord };
