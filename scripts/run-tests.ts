// Canonical entrypoint for running this repository's test suite (`bun run test` and the
// smoke:qc test step). Owns the run lock and temp-tree lifecycle for the WHOLE run, then
// executes `bun test --parallel`: worker processes each load the [test].preload, which
// would otherwise fight over the repo lock and sweep live sibling fixtures. Ownership is
// conveyed through the lock file itself — the spawned `bun test` pid is recorded there and
// workers match it against their own process.ppid (Bun.spawn does not propagate runtime
// process.env mutations, so an env marker cannot work). A direct `bun test` (no wrapper)
// keeps the serial single-process behavior via the unchanged preload path.
import { availableParallelism } from 'node:os';
import { cwd, exit } from 'node:process';

import { removeTempTree } from '../shared/src/lib/remove-temp-tree.ts';
import { acquireTestRunLock, markTestRunChild, readActiveTestRun } from './lib/test-run-lock.ts';
import { sweepOrphanTestTempTrees, testTempRootFor } from './lib/test-temp-root.ts';

const projectRoot = cwd();
const forwarded = Bun.argv.slice(2).filter((arg) => arg !== '--serial');
const serial =
	Bun.argv.includes('--serial') || forwarded.some((arg) => arg.startsWith('--parallel'));
// Bun's --parallel default is one worker per core. Full saturation starves timing-sensitive
// tests (idle nudges, completion-marker grace windows) because every worker also spawns its
// own git/bun children; the longest single file bounds wall time anyway, so extra workers
// past ~8 buy nothing. Cap well below the core count and leave scheduler headroom.
const workerCount = Math.min(8, Math.max(2, availableParallelism() - 2));
// Workers saturate every core, so a git- or spawn-heavy test can blow bun's default 5s
// per-test ceiling on load alone. Raise it for parallel runs unless the caller chose one.
const timeoutArgs =
	serial || forwarded.some((arg) => arg.startsWith('--timeout')) ? [] : ['--timeout=15000'];

const lock = acquireTestRunLock(projectRoot);
if (lock === undefined) {
	const active = readActiveTestRun(projectRoot);
	console.error(
		`Another bun test for this repository is already running (pid ${active?.pid ?? 'unknown'}). ` +
			'Concurrent runs corrupt shared fixtures and produce phantom failures - wait for it to ' +
			'finish (or kill it), then re-run.',
	);
	exit(1);
}

let exitCode: number;
try {
	// The lock guarantees no other suite for this repo is running, so everything under the
	// temp root is litter from a previous (possibly killed) run.
	await removeTempTree(testTempRootFor(projectRoot));
	await sweepOrphanTestTempTrees(projectRoot);

	const child = Bun.spawn(
		[
			process.execPath,
			'test',
			...(serial ? [] : [`--parallel=${workerCount}`]),
			...timeoutArgs,
			...forwarded,
		],
		{
			stderr: 'inherit',
			stdin: 'inherit',
			stdout: 'inherit',
			windowsHide: true,
		},
	);
	markTestRunChild(projectRoot, child.pid);
	exitCode = await child.exited;
} catch (err) {
	console.error(err instanceof Error ? err.message : err);
	exitCode = 1;
} finally {
	// Best-effort: a child that outlives the suite can hold a handle on Windows; the next
	// run's start-sweep catches whatever this leaves behind.
	await removeTempTree(testTempRootFor(projectRoot));
	lock.release();
}

exit(exitCode);
