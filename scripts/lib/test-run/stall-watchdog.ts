import { stderr as processStderr, stdout as processStdout } from 'node:process';

import { killProcessTree } from '../../../shared/src/lib/processTree.ts';

/**
 * No-output watchdog for one `bun test` phase.
 *
 * `bun test --parallel` can deadlock (oven-sh/bun#39987, still open against 1.4.0 and a
 * carry-over from #36235 rather than anything the 1.4 upgrade introduced). One `--test-worker`
 * survives with every thread parked, the parent goes on waiting, and the log freezes. Nothing
 * fails: the run simply never ends. That is the worst shape a CI failure can take -- the job
 * burns its whole budget and reports a timeout, which reads as infrastructure flakiness rather
 * than as the run never having validated anything. The reporters' own mitigation is the one
 * adopted here, because the stall does not reproduce on an identical retry: notice that output
 * has gone quiet, kill the phase, run it again once.
 *
 * The signal is output silence, not elapsed time. A wall-clock cap would have to sit above the
 * suite's slowest legitimate run and would then punish a machine for being slow; silence
 * distinguishes a wedged run from a merely unhurried one, since a live phase keeps reporting
 * files as its workers finish them. The threshold still has to clear the longest quiet stretch a
 * GREEN run produces -- see TEST_STALL_TIMEOUT_MS.
 *
 * The cost is the inherited stdio pair: the child's streams are piped so chunks can be timed,
 * then forwarded verbatim. FORCE_COLOR keeps bun's reporter colored through that pipe (it
 * otherwise colors on tty-ness alone), and is set only when this process's own stdout is a
 * terminal, so redirected logs stay free of escape codes.
 */

/**
 * How long a phase may produce no output at all before it is treated as wedged.
 *
 * Measured rather than guessed, in both configurations this repo runs: the two-phase `bun run
 * test` and the single serial `--coverage` run behind smoke:qc's test step. Timing every output
 * chunk of a full, non-wedged run of each put the longest legitimate gap at ~31s, and at the
 * same place both times -- one orchestrator test drives a coding iteration to its own timeout
 * and says nothing while it does. The parallel phase never exceeded 6s, because eight workers
 * report files continuously; that number is the misleading one to design against, and the
 * threshold it would justify would kill a healthy run on any machine slower than this one.
 *
 * So: roughly 6x the observed worst case, which still leaves a wedged CI job losing minutes
 * rather than its whole budget. The margin is narrower than 6x suggests -- under coverage the
 * runner-up gap is ~25s, not the parallel phase's ~7s -- so do not tighten this toward the
 * observed maximum without re-measuring. A false positive kills a green run, and the retry it
 * triggers is not free. Re-measure if either config gains a test that waits longer than that
 * orchestrator one does.
 *
 * `AIDD_TEST_STALL_MS` overrides it for a machine slow or loaded enough to need the room; set 0
 * to disable the watchdog entirely.
 */
export const TEST_STALL_TIMEOUT_MS = ((): number => {
	const fallback = 180_000;
	const raw = process.env.AIDD_TEST_STALL_MS;
	if (raw === undefined || raw === '') return fallback;
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
})();

/** How long the killed tree is given to close its pipes before the phase reports back anyway. */
const KILL_GRACE_MS = 5_000;

/** How often the idle clock is checked. Fine enough to be prompt, coarse enough to be free. */
const POLL_INTERVAL_MS = 1_000;

interface ByteSink {
	write: (chunk: Uint8Array) => boolean;
}

export interface TestPhaseSinks {
	stderr: ByteSink;
	stdout: ByteSink;
}

export interface TestPhaseResult {
	exitCode: number;
	/** Milliseconds of silence that tripped the watchdog; undefined unless `stalled`. */
	idleMs?: number;
	/** True when the watchdog killed the phase instead of the phase exiting on its own. */
	stalled: boolean;
}

export interface RunTestPhaseOptions {
	/** Receives the child pid before any output is read, for reaper attachment and lock marking. */
	onSpawn?: (pid: number) => void;
	sinks?: TestPhaseSinks;
	stallTimeoutMs?: number;
}

/** Forwards every chunk to the console it was bound for, reporting when each one arrived. */
async function forwardStream(
	stream: ReadableStream<Uint8Array>,
	sink: ByteSink,
	onChunk: () => boolean,
): Promise<void> {
	const reader = stream.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value === undefined) continue;
		// A stalled phase has already been killed and reported; anything its dying tree emits
		// afterwards would interleave with the retry's output, so it is read but not forwarded.
		if (onChunk()) sink.write(value);
	}
}

/**
 * Runs one `bun test` invocation, killing it if it produces no output for `stallTimeoutMs`.
 * Returns the child's exit code, plus whether the watchdog is what ended it.
 */
export async function runTestPhase(
	args: string[],
	options: RunTestPhaseOptions = {},
): Promise<TestPhaseResult> {
	const sinks = options.sinks ?? { stderr: processStderr, stdout: processStdout };
	const stallTimeoutMs = options.stallTimeoutMs ?? TEST_STALL_TIMEOUT_MS;

	const child = Bun.spawn([process.execPath, ...args], {
		// Bun.spawn inherits the whole parent environment when `env` is omitted, so this spread
		// widens nothing: it restates the inheritance the phase already had in order to add one
		// key. FORCE_COLOR only re-enables the reporter's color, which piping the streams for
		// timing would otherwise strip.
		env: { ...process.env, ...colorEnv() }, // allow-env-spread-policy
		stderr: 'pipe',
		stdin: 'inherit',
		stdout: 'pipe',
		windowsHide: true,
	});
	options.onSpawn?.(child.pid);

	let lastOutputAt = performance.now();
	let stalledFor: number | undefined;
	const noteChunk = (): boolean => {
		lastOutputAt = performance.now();
		return stalledFor === undefined;
	};

	const finished = Promise.all([
		forwardStream(child.stdout, sinks.stdout, noteChunk),
		forwardStream(child.stderr, sinks.stderr, noteChunk),
		child.exited,
	]);

	if (stallTimeoutMs <= 0) {
		const [, , exitCode] = await finished;
		return { exitCode, stalled: false };
	}

	let settled = false;
	const markSettled = (): void => {
		settled = true;
	};
	// A stream error ends the phase just as an exit does; the awaits below surface the reason.
	void finished.then(markSettled, markSettled);
	for (;;) {
		await Bun.sleep(POLL_INTERVAL_MS);
		if (settled) break;
		const idleMs = performance.now() - lastOutputAt;
		if (idleMs < stallTimeoutMs) continue;
		stalledFor = Math.round(idleMs);
		// The workers are separate processes, so killing the `bun test` parent alone would leave
		// the parked one holding its fixtures and temp tree.
		await killProcessTree(child.pid);
		break;
	}

	if (stalledFor === undefined) {
		const [, , exitCode] = await finished;
		return { exitCode, stalled: false };
	}
	// A pipe held open by a grandchild that outlived the kill must not become the new hang.
	const raced = await Promise.race([finished, Bun.sleep(KILL_GRACE_MS).then(() => undefined)]);
	return { exitCode: raced?.[2] ?? 1, idleMs: stalledFor, stalled: true };
}

/** Color is a terminal affordance; a redirected log should not collect escape codes. */
function colorEnv(): Record<string, string> {
	return processStdout.isTTY ? { FORCE_COLOR: '1' } : {};
}
