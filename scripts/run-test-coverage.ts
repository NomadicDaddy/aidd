import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cwd, exit } from 'node:process';

import { TEST_COVERAGE_DIR, TEST_COVERAGE_LCOV_PATH } from './lib/smoke-cache/coverage.ts';
import { COVERAGE_SUMMARY_PATH } from './lib/test-coverage/contracts.ts';
import {
	createCoverageReport,
	printCoverageReport,
	writeCoverageReport,
} from './lib/test-coverage/report.ts';

async function runCoverageTests(projectRoot: string, testFilters: string[]): Promise<number> {
	const coverageProcess = Bun.spawn(
		[
			process.execPath,
			'scripts/run-tests.ts',
			// A triumvirate retry test shares process-level state with other files and fails only
			// under coverage concurrency. Keep this slower quality gate deterministic.
			'--serial',
			'--timeout=15000',
			'--coverage',
			'--coverage-reporter=lcov',
			'--coverage-dir',
			TEST_COVERAGE_DIR,
			...testFilters,
		],
		{
			cwd: projectRoot,
			stderr: 'inherit',
			stdout: 'inherit',
			windowsHide: true,
		},
	);
	return await coverageProcess.exited;
}

export async function runTestCoverage(projectRoot = cwd()): Promise<number> {
	await rm(resolve(projectRoot, TEST_COVERAGE_DIR), { force: true, recursive: true });
	const testExitCode = await runCoverageTests(projectRoot, Bun.argv.slice(2));
	if (testExitCode !== 0) return testExitCode;

	const report = await createCoverageReport(projectRoot);
	printCoverageReport(report);
	await writeCoverageReport(resolve(projectRoot, COVERAGE_SUMMARY_PATH), report);
	console.log(`LCOV: ${TEST_COVERAGE_LCOV_PATH}`);
	console.log(`Area summary: ${COVERAGE_SUMMARY_PATH}`);
	return report.passed ? 0 : 1;
}

if (import.meta.main) exit(await runTestCoverage());
