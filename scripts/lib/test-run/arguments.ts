import { availableParallelism } from 'node:os';

// Workers saturate every core, so a git- or spawn-heavy test can blow bun's default 5s per-test
// ceiling on scheduling latency alone. This is a floor for that, not headroom for slow work: raise
// it and a test that hangs stops being caught, it just fails later. A test whose subject IS an
// elapsed deadline has nothing to trade for margin and must opt into a higher ceiling of its own —
// see saturatedSuiteTestTimeoutMs in test/cli/_helpers/orchestrator-fixture.ts, which only means
// anything while it stays above this number. Do not size such a test against this constant.
export const DEFAULT_TEST_TIMEOUT_MS = 15_000;
export const MAX_TEST_WORKERS = 8;

// These files contend for shared OS resources — real process trees, process-wide orchestrator
// state, or a listening socket. Mixing them into the parallel pool produced different failures
// on repeated otherwise-green runs.
// Keep the large hermetic majority parallel, then run this small group in one isolated worker.
export const SERIAL_TEST_FILES = [
	// Binds a real HTTP listener; under parallel load it times out where it runs in 279ms alone.
	'./test/backend/channel-api-client.test.ts',
	'./test/backend/web-working-tree-actions.test.ts',
	'./test/cli/agent-tools.test.ts',
	'./test/cli/backend-stream-reap.test.ts',
	'./test/cli/orchestrator-termination.test.ts',
	'./test/cli/orchestrator-triumvirate.test.ts',
	'./test/scripts/test-run-stall-watchdog.test.ts',
	'./test/shared/child-process-reaper.test.ts',
	'./test/shared/process-table-win.test.ts',
	'./test/shared/process-table.test.ts',
	'./test/shared/process-tree-kill.test.ts',
] as const;

function workerCount(parallelism: number): number {
	return Math.min(MAX_TEST_WORKERS, Math.max(2, parallelism - 2));
}

export function buildBunTestArgs(args: string[], parallelism = availableParallelism()): string[] {
	const serial = args.includes('--serial');
	const forwarded = args.filter((arg) => arg !== '--serial');
	const callerSelectedWorkers = forwarded.some((arg) => arg.startsWith('--parallel'));
	const callerSelectedTimeout = forwarded.some((arg) => arg.startsWith('--timeout'));

	return [
		'test',
		...(serial || callerSelectedWorkers ? [] : [`--parallel=${workerCount(parallelism)}`]),
		...(callerSelectedTimeout ? [] : [`--timeout=${DEFAULT_TEST_TIMEOUT_MS}`]),
		...forwarded,
	];
}

export function buildBunTestRuns(args: string[], parallelism = availableParallelism()): string[][] {
	if (args.length > 0) return [buildBunTestArgs(args, parallelism)];

	// Ignore by repository-relative path, not by base name: three base names in this suite already
	// appear in two directories, and a basename pattern would drop every namesake from the parallel
	// phase while the isolated phase ran only the listed one. That loses a whole file silently, with
	// no failure to notice.
	const ignoreIsolated = SERIAL_TEST_FILES.map(
		(file) => `--path-ignore-patterns=**/${file.replace(/^\.\//, '')}`,
	);
	return [
		buildBunTestArgs(ignoreIsolated, parallelism),
		buildBunTestArgs(['--serial', ...SERIAL_TEST_FILES], parallelism),
	];
}
