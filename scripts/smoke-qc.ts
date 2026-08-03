import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

import { removeTempTree } from '../shared/src/lib/remove-temp-tree.ts';
import { assertSmokeCacheCoverage } from './lib/smoke-qc/coverage.ts';
import {
	FAST_QC_STEP_NAMES,
	FAST_QC_STEPS,
	FAST_STEP_OVERRIDES,
	SMOKE_QC_STEPS,
	type SmokeQcStep,
} from './lib/smoke-qc/steps.ts';
import { readActiveTestRun, type TestRunLockRecord } from './lib/test-run-lock.ts';
import { sweepOrphanTestTempTrees, testTempRootFor } from './lib/test-temp-root.ts';
import {
	canSkipStep,
	getSmokeCacheStatus,
	recordStepResult,
	recordStepSuccess,
} from './smoke-cache.ts';

export interface SmokeQcArgs {
	cacheStatus: boolean;
	fast: boolean;
	force: boolean;
}

// The step definitions live in ./lib/smoke-qc/steps.ts; re-exported so callers and tests keep a
// single import surface for "the smoke:qc gate" rather than reaching into its internals.
export { FAST_QC_STEP_NAMES, FAST_QC_STEPS, FAST_STEP_OVERRIDES, SMOKE_QC_STEPS };

export function parseSmokeQcArgs(args: string[]): SmokeQcArgs {
	const { values } = parseArgs({
		args,
		options: {
			'cache-status': { default: false, type: 'boolean' },
			fast: { default: false, type: 'boolean' },
			force: { default: false, type: 'boolean' },
		},
		strict: true,
	});

	return {
		cacheStatus: values['cache-status'] ?? false,
		fast: values.fast ?? false,
		force: values.force ?? false,
	};
}

function formatDuration(durationMs: number): string {
	return `${(durationMs / 1000).toFixed(1)}s`;
}

export function getConcurrentTestBlocker(
	stepName: string,
	activeRun: TestRunLockRecord | undefined,
): { exitCode: 1; message: string } | null {
	if (stepName !== 'test' || activeRun === undefined) return null;
	return {
		exitCode: 1,
		message: `another bun test is already running (pid ${activeRun.pid}); tests were NOT validated by this run`,
	};
}

async function runCommand(step: SmokeQcStep): Promise<number> {
	const process = Bun.spawn(step.command, {
		stderr: 'inherit',
		stdout: 'inherit',
		windowsHide: true,
	});
	return await process.exited;
}

async function printCacheStatus(projectRoot: string, steps: SmokeQcStep[]): Promise<void> {
	const statuses = await getSmokeCacheStatus(
		projectRoot,
		steps.map((step) => step.name),
	);

	for (const status of statuses) {
		const state = !status.cacheable
			? 'uncacheable'
			: status.valid
				? 'valid'
				: status.result === 'fail'
					? 'failed'
					: 'miss';
		const duration = status.durationMs === null ? '-' : formatDuration(status.durationMs);
		// The timestamp answers "is this hit stale enough to distrust?", which the state alone
		// cannot. spernakit's status has always carried it; this is the same information.
		const since = status.recordedAt === null ? 'never run' : `recorded ${status.recordedAt}`;
		console.log(
			`${status.step}: ${state} (${status.dependencyCount} files, duration ${duration}, ${since})`,
		);
	}
}

export async function runSmokeQc(args: SmokeQcArgs, projectRoot = cwd()): Promise<number> {
	const steps = args.fast ? FAST_QC_STEPS : SMOKE_QC_STEPS;
	assertSmokeCacheCoverage(steps.map((step) => step.name));

	if (args.cacheStatus) {
		await printCacheStatus(projectRoot, steps);
		return 0;
	}

	// Test-fixture litter from a previous (possibly killed) bun test run. The [test].preload
	// sweeps this too, but a cached test step never reaches it, so backstop here. Only safe
	// when no suite is running - a live run owns the tree. The fast subset never runs tests,
	// so it neither creates nor needs to sweep this litter.
	if (!args.fast && readActiveTestRun(projectRoot) === undefined) {
		await removeTempTree(testTempRootFor(projectRoot));
	}
	if (!args.fast) {
		await sweepOrphanTestTempTrees(projectRoot);
	}

	// Every step here is an order-independent static check, so run them ALL and report the
	// aggregate rather than stopping at the first red. Fail-fast lets one persistently failing
	// step mask every later gate, which is how violations accumulate unseen behind it. This
	// matches spernakit's qc mode, which learned the same lesson (scripts/smoke.ts).
	const failedSteps: string[] = [];

	for (const step of steps) {
		if (await canSkipStep(projectRoot, step.name, args.force)) {
			console.log(`[CACHED] ${step.label}`);
			continue;
		}

		// A concurrent suite corrupts shared fixtures and fails dozens of unrelated tests.
		// Do not collide, but fail the gate: smoke:qc cannot report success without tests.
		const blocker = getConcurrentTestBlocker(step.name, readActiveTestRun(projectRoot));
		if (blocker !== null) {
			await recordStepResult(projectRoot, step.name, 'fail', 0);
			console.error(`[FAIL] ${step.label} - ${blocker.message}`);
			failedSteps.push(step.label);
			continue;
		}

		console.log(`[RUN] ${step.label}`);
		const startedAt = Date.now();
		const exitCode = await runCommand(step);
		const durationMs = Date.now() - startedAt;

		if (exitCode !== 0) {
			await recordStepResult(projectRoot, step.name, 'fail', durationMs);
			console.error(`[FAIL] ${step.label} exited with code ${exitCode}`);
			failedSteps.push(step.label);
			continue;
		}

		await recordStepSuccess(projectRoot, step.name, durationMs);
		console.log(`[PASS] ${step.label} ${formatDuration(durationMs)}`);
	}

	if (failedSteps.length > 0) {
		console.error(`\n${failedSteps.length} step(s) failed:`);
		for (const label of failedSteps) console.error(`  [FAIL] ${label}`);
		return 1;
	}

	return 0;
}

if (import.meta.main) {
	try {
		exit(await runSmokeQc(parseSmokeQcArgs(Bun.argv.slice(2))));
	} catch (err) {
		console.error('Fatal error:', err instanceof Error ? err.message : String(err));
		exit(1);
	}
}
