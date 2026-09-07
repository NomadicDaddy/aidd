// Canonical entrypoint for running this repository's test suite (`bun run test` and the
// smoke:qc test step). Owns the run lock and temp-tree lifecycle for the WHOLE run, then
// executes the hermetic majority in parallel and the real-process isolation group serially.
// Every worker loads the [test].preload, which would otherwise fight over the repo lock and
// sweep live sibling fixtures. Ownership is
// conveyed through the lock file itself — the spawned `bun test` pid is recorded there and
// workers match it against their own process.ppid (Bun.spawn does not propagate runtime
// process.env mutations, so an env marker cannot work). A direct `bun test` (no wrapper)
// keeps the serial single-process behavior via the unchanged preload path.
import { cwd, exit, stderr as processStderr, stdout as processStdout } from 'node:process';

import { ChildProcessReaper } from '../shared/src/lib/childProcessReaper.ts';
import { removeTempTree } from '../shared/src/lib/remove-temp-tree.ts';
import { acquireTestRunLock, markTestRunChild, readActiveTestRun } from './lib/test-run-lock.ts';
import { buildBunTestRuns } from './lib/test-run/arguments.ts';
import { runTestPhase, type TestPhaseResult } from './lib/test-run/stall-watchdog.ts';
import { sweepOrphanTestTempTrees, testTempRootFor } from './lib/test-temp-root.ts';

const projectRoot = cwd();

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

	// One attempt at a phase: spawn it under the stall watchdog, then reap whatever the suite
	// left alive. The reaper is per-attempt because a stalled attempt is exactly the case that
	// leaves survivors behind.
	async function attemptPhase(args: string[]): Promise<TestPhaseResult> {
		const reaper = new ChildProcessReaper();
		const result = await runTestPhase(args, {
			onSpawn: (pid) => {
				reaper.attach(pid);
				markTestRunChild(projectRoot, pid);
			},
		});
		const reaped = await reaper.reap();
		if (reaped.length > 0) {
			console.warn(`Reaped ${reaped.length} test process(es) left alive after suite exit.`);
		}
		return result;
	}

	exitCode = 0;
	const runs = buildBunTestRuns(Bun.argv.slice(2));
	const failedPhases: number[] = [];
	for (const [index, args] of runs.entries()) {
		const phase = runs.length > 1 ? `test phase ${index + 1}/${runs.length}` : 'the test suite';
		if (runs.length > 1) console.log(`\nTest phase ${index + 1}/${runs.length}`);
		let result = await attemptPhase(args);
		// A stall is not a result. Retrying once is what makes it recoverable rather than a job
		// that runs out of time having validated nothing (see the stall-watchdog header). The
		// killed attempt's fixtures are still on disk and its `bun test` is a worker of this
		// owned run, so its preload skips the sweep — this is the only cleanup before the retry.
		if (result.stalled) {
			console.warn(
				`\nNo output from ${phase} for ${Math.round((result.idleMs ?? 0) / 1000)}s - killed it as ` +
					'stalled (oven-sh/bun#39987). Sweeping fixtures and retrying once.',
			);
			try {
				await removeTempTree(testTempRootFor(projectRoot));
				await sweepOrphanTestTempTrees(projectRoot);
			} catch (err) {
				// A handle held by the tree we just killed can outlast even the retrying remove.
				// Retrying over leftovers still beats reporting the stall as the run's answer, so
				// say what was left behind and go on -- it explains any phantom failure that follows.
				console.warn(
					`Could not clear the stalled phase's fixtures: ${err instanceof Error ? err.message : err}`,
				);
			}
			result = await attemptPhase(args);
			// Twice is no longer a coin-flip deadlock, and a silent third attempt would only
			// spend more of the budget the watchdog exists to protect.
			if (result.stalled) {
				console.error(
					`\n${phase} stalled again after its retry; reporting it as failed rather than waiting.`,
				);
			}
		}
		// Every phase runs even after a red one. Stopping here hides the isolation phase behind any
		// parallel failure, and that group exists precisely because those files fail for reasons the
		// parallel phase cannot surface. smoke:qc reports all failures for the same reason, so a
		// runner that stops at the first one contradicts the gate it feeds.
		if (result.exitCode !== 0 || result.stalled) {
			exitCode = result.exitCode === 0 ? 1 : result.exitCode;
			failedPhases.push(index + 1);
		}
	}
	if (runs.length > 1 && failedPhases.length > 0) {
		console.error(`\nTest phase(s) ${failedPhases.join(', ')} of ${runs.length} failed.`);
	}
} catch (err) {
	console.error(err instanceof Error ? err.message : err);
	exitCode = 1;
} finally {
	// Best-effort: a child that outlives the suite can hold a handle on Windows; the next
	// run's start-sweep catches whatever this leaves behind.
	await removeTempTree(testTempRootFor(projectRoot));
	lock.release();
}

// The phases' output is relayed through this process's streams rather than inherited straight
// from the child (the watchdog has to see the chunks to time them). Writes to a pipe are
// asynchronous, and process.exit does not wait for them, so exiting here would truncate the tail
// of the report -- the pass/fail summary -- whenever this runs under CI or any captured stream.
await Promise.all([flushStream(processStdout), flushStream(processStderr)]);
exit(exitCode);

/** Resolves once everything already written to the stream has actually been handed off. */
function flushStream(stream: NodeJS.WriteStream): Promise<void> {
	return new Promise((resolve) => {
		stream.write('', () => resolve());
	});
}
