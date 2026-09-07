// Loaded by bunfig.toml's [test].preload before every `bun test` for this repository.
// Two suites running at once corrupt shared state (.tmp-orchestrator-tests/ fixtures,
// ports, temp trees) and fail dozens of unrelated tests, so the second run refuses to
// start instead. Crashed runs leave a stale lock that clears itself on the next attempt.
//
// scripts/run-tests.ts (the `bun run test` wrapper) owns the lock/sweep/cleanup for
// parallel runs: every `bun test --parallel` worker loads this preload too, and
// worker-scoped locking would make siblings refuse each other while a worker-scoped sweep
// would delete live sibling fixtures. The wrapper records the `bun test` pid it spawned on
// the lock; a worker whose parent IS that pid belongs to the owned run and skips lock,
// sweep, and cleanup entirely.
import { afterAll } from 'bun:test';

import { acquireTestRunLock, readActiveTestRun } from '../scripts/lib/test-run-lock.ts';
import { sweepOrphanTestTempTrees } from '../scripts/lib/test-temp-root.ts';
import { removeTempTree } from '../shared/src/lib/remove-temp-tree.ts';
import { testTempRoot } from './_helpers/temp.ts';

async function wrapperOwnsThisRun(): Promise<boolean> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const record = readActiveTestRun(process.cwd());
		if (record === undefined) return false;
		if (record.pid === process.pid) return false;
		if (record.testParentPid !== undefined) {
			// process.ppid: this process is one of the owned run's workers. process.pid: this
			// process IS the spawned `bun test` (in case the parent also loads the preload).
			return record.testParentPid === process.ppid || record.testParentPid === process.pid;
		}
		// A live record without a marked child pid is either a foreign run (refuse below) or a
		// wrapper that spawned us microseconds ago and has not written the child pid yet. One
		// short re-read settles it; the delay only affects runs that would refuse anyway.
		if (attempt === 0) await Bun.sleep(250);
	}
	return false;
}

if (!(await wrapperOwnsThisRun())) {
	const lock = acquireTestRunLock(process.cwd());
	if (lock === undefined) {
		const active = readActiveTestRun(process.cwd());
		console.error(
			`Another bun test for this repository is already running (pid ${active?.pid ?? 'unknown'}). ` +
				'Concurrent runs corrupt shared fixtures and produce phantom failures - wait for it to ' +
				'finish (or kill it), then re-run. (For parallel runs, use `bun run test` - it owns ' +
				'the lock for all of its workers.)',
		);
		process.exit(1);
	}

	// The lock guarantees no other suite for this repo is running, so everything under
	// testTempRoot is litter from a previous (possibly killed) run - sweep it before tests.
	// Trees abandoned by deleted checkouts (whose key never runs again) go with it.
	await removeTempTree(testTempRoot);
	await sweepOrphanTestTempTrees(process.cwd());

	// bun test does not fire process.on('exit') handlers, so end-of-run cleanup lives in a
	// global afterAll (preload hooks span the whole run). A killed run skips it; the stale
	// lock self-clears on the next acquire and the sweep above catches the leftover tree.
	afterAll(async () => {
		lock.release();
		// Best-effort: a child that outlives the suite can hold a handle on Windows. The retry
		// usually outlasts it; a handle that survives even that leaves the tree for the sweep at
		// the next suite start.
		await removeTempTree(testTempRoot).catch(() => {});
	});
}
