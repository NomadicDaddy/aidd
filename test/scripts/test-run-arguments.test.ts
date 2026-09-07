import { describe, expect, test } from 'bun:test';

import {
	buildBunTestArgs,
	buildBunTestRuns,
	DEFAULT_TEST_TIMEOUT_MS,
	MAX_TEST_WORKERS,
	SERIAL_TEST_FILES,
} from '../../scripts/lib/test-run/arguments.ts';
import {
	saturatedSuiteTestTimeoutMs,
	slowOrchestratorTestTimeoutMs,
} from '../cli/_helpers/orchestrator-fixture.ts';

describe('test runner arguments', () => {
	test('bounds automatic parallelism and applies the suite timeout', () => {
		expect(buildBunTestArgs([], 32)).toEqual([
			'test',
			`--parallel=${MAX_TEST_WORKERS}`,
			`--timeout=${DEFAULT_TEST_TIMEOUT_MS}`,
		]);
	});

	test('preserves explicit worker and timeout choices', () => {
		expect(buildBunTestArgs(['--parallel=4', '--timeout=45000', 'test/cli'], 32)).toEqual([
			'test',
			'--parallel=4',
			'--timeout=45000',
			'test/cli',
		]);
	});

	test('serial mode removes only the wrapper flag and still applies the timeout', () => {
		expect(buildBunTestArgs(['--serial', '--coverage'], 32)).toEqual([
			'test',
			`--timeout=${DEFAULT_TEST_TIMEOUT_MS}`,
			'--coverage',
		]);
	});

	test('the default suite isolates real-process tests after the parallel majority', () => {
		const [majority, isolated] = buildBunTestRuns([], 32);
		expect(majority).toContain('--parallel=8');
		for (const file of SERIAL_TEST_FILES) {
			expect(majority).toContain(`--path-ignore-patterns=**/${file.replace(/^\.\//, '')}`);
			expect(isolated).toContain(file);
		}
		expect(isolated).not.toContain('--parallel=8');
	});

	// A base-name pattern would exclude every namesake from the parallel phase while the isolated
	// phase ran only the listed path, so the namesake would run in neither and nothing would fail.
	test('the parallel phase excludes the isolated files by path, not by base name', () => {
		const [majority] = buildBunTestRuns([], 32);
		const namesakes = SERIAL_TEST_FILES.filter((file) =>
			majority?.includes(`--path-ignore-patterns=**/${file.split('/').at(-1)}`),
		);
		expect(namesakes).toEqual([]);
	});

	// A rename leaves the isolated phase pointing at nothing while the parallel phase happily runs
	// the moved file, so the isolation silently lapses. Fail here instead.
	test('every isolated file still exists', async () => {
		for (const file of SERIAL_TEST_FILES) {
			expect(await Bun.file(new URL(`../../${file}`, import.meta.url)).exists()).toBe(true);
		}
	});

	// The escape hatch only exists while it sits ABOVE the default: raise the default to meet it and
	// every opt-in site keeps compiling, keeps reading like protection, and silently stops granting
	// any. That is how it lapsed once already, so assert the relationship rather than the number.
	test('the saturated-suite ceiling stays above the default the wrapper applies', () => {
		expect(saturatedSuiteTestTimeoutMs).toBeGreaterThan(DEFAULT_TEST_TIMEOUT_MS);
		expect(slowOrchestratorTestTimeoutMs).toBeGreaterThanOrEqual(DEFAULT_TEST_TIMEOUT_MS);
	});

	test('an explicitly targeted run remains a single caller-controlled phase', () => {
		expect(buildBunTestRuns(['test/scripts'], 32)).toEqual([
			['test', '--parallel=8', `--timeout=${DEFAULT_TEST_TIMEOUT_MS}`, 'test/scripts'],
		]);
	});
});
