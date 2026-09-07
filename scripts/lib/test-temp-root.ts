import { readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { readActiveTestRunByKey, repoRootKey } from './test-run-lock.ts';

const TEST_TEMP_PREFIX = 'aidd-tests-';

// Idle time before a tree with no observable lock is treated as abandoned. The age gate
// closes the race where a suite in another root is between writing its lock and creating
// its first fixture; a live tree is always seconds old, never an hour.
const ORPHAN_MAX_AGE_MS = 60 * 60 * 1000;

// Single parent directory for every temp fixture a test suite creates, scoped per
// repository root with the SAME key as the test-run lock: a sweep may only delete a tree
// whose owning lock it can observe, so concurrent suites in other checkouts (aidd
// worktrees, parallel clones) never lose live fixtures. Keeping fixtures under one root
// turns cleanup into a single tree removal — the [test].preload sweeps it at suite start
// and smoke-qc.ts backstops it between runs.
export function testTempRootFor(rootDir: string): string {
	return join(tmpdir(), `${TEST_TEMP_PREFIX}${repoRootKey(rootDir)}`);
}

// Removes trees left by roots that will never run again (a deleted aidd worktree's key
// never recurs, so its own start-of-run sweep can't reclaim it). A tree is only removed
// when its owning lock is absent or stale AND the tree has been idle past the age gate.
export async function sweepOrphanTestTempTrees(ownRootDir: string): Promise<void> {
	const ownRoot = testTempRootFor(ownRootDir);
	let entries: string[];
	try {
		entries = readdirSync(tmpdir());
	} catch {
		return;
	}
	for (const name of entries) {
		if (!name.startsWith(TEST_TEMP_PREFIX)) continue;
		const path = join(tmpdir(), name);
		if (path === ownRoot) continue;
		if (readActiveTestRunByKey(name.slice(TEST_TEMP_PREFIX.length)) !== undefined) continue;
		let idleMs: number;
		try {
			idleMs = Date.now() - statSync(path).mtimeMs;
		} catch {
			continue;
		}
		if (idleMs < ORPHAN_MAX_AGE_MS) continue;
		await removeTempTree(path);
	}
}
