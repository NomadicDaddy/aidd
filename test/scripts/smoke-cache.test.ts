import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'bun:test';

import { parseCoverageFiles, TEST_COVERAGE_DIR } from '../../scripts/lib/smoke-cache/coverage.ts';
import { CI_WORKFLOW_TEST_INPUT } from '../../scripts/lib/smoke-cache/dependencies.ts';
import {
	canSkipStep,
	getSmokeCachePath,
	getSmokeCacheStatus,
	recordStepResult,
	recordStepSuccess,
} from '../../scripts/smoke-cache.ts';
import { parseSmokeQcArgs, SMOKE_QC_STEPS } from '../../scripts/smoke-qc.ts';

import { testTempDir } from '../_helpers/temp.ts';
async function createSmokeProject(): Promise<string> {
	const root = await testTempDir('aidd-smoke-cache-');
	await mkdir(join(root, 'cli', 'src'), { recursive: true });
	await mkdir(join(root, '.github', 'workflows'), { recursive: true });
	await mkdir(join(root, 'frontend', 'src', 'pages', 'runs'), { recursive: true });
	await mkdir(join(root, 'frontend', 'src'), { recursive: true });
	await mkdir(join(root, 'scripts', 'lib', 'smoke-cache'), { recursive: true });
	await mkdir(join(root, 'scripts', 'lib', 'test-coverage'), { recursive: true });
	await mkdir(join(root, 'scripts', 'lib', 'third-party-licenses'), { recursive: true });
	await mkdir(join(root, 'scripts'), { recursive: true });
	await mkdir(join(root, 'test', 'scripts'), { recursive: true });
	await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n');
	await writeFile(join(root, 'bun.lock'), '');
	await writeFile(join(root, 'bunfig.toml'), 'env = false\n');
	await writeFile(join(root, 'knip.jsonc'), '{"entry":["scripts/*.ts"]}\n');
	await writeFile(join(root, CI_WORKFLOW_TEST_INPUT), 'name: CI\n');
	await writeFile(join(root, 'tsconfig.json'), '{}\n');
	await writeFile(join(root, 'frontend', 'package.json'), '{"name":"fixture-frontend"}\n');
	await writeFile(join(root, 'frontend', 'tsconfig.json'), '{}\n');
	await writeFile(join(root, 'frontend', 'vite.config.ts'), 'export default {};\n');
	await writeFile(
		join(root, 'frontend', 'src', 'App.tsx'),
		'export function App() { return null; }\n',
	);
	await writeFile(
		join(root, 'frontend', 'src', 'pages', 'runs', 'RunsPage.tsx'),
		'export function RunsPage() { return null; }\n',
	);
	await writeFile(join(root, 'cli', 'src', 'index.ts'), 'export const value = 1;\n');
	await writeFile(join(root, 'cli', 'src', 'covered.ts'), 'export const covered = 1;\n');
	await writeFile(join(root, 'scripts', 'self-contained.ts'), 'export {};\n');
	await writeFile(join(root, 'scripts', 'smoke-cache.ts'), 'export {};\n');
	await writeFile(join(root, 'scripts', 'smoke-qc.ts'), 'export {};\n');
	await writeFile(join(root, 'scripts', 'lib', 'smoke-cache', 'coverage.ts'), 'export {};\n');
	await writeFile(join(root, 'scripts', 'lib', 'test-coverage', 'contracts.ts'), 'export {};\n');
	await writeFile(
		join(root, 'scripts', 'lib', 'third-party-licenses', 'registry-validation.ts'),
		'export const valid = true;\n',
	);
	await writeFile(join(root, 'scripts', 'run-test-coverage.ts'), 'export {};\n');
	await writeFile(
		join(root, 'test', 'scripts', 'smoke-cache.test.ts'),
		'import {} from "bun:test";\n',
	);
	return root;
}

async function writeCoverage(root: string, files: string[]): Promise<void> {
	await mkdir(join(root, TEST_COVERAGE_DIR), { recursive: true });
	await writeFile(
		join(root, TEST_COVERAGE_DIR, 'lcov.info'),
		files.map((file) => `TN:\nSF:${file}\nend_of_record`).join('\n'),
		'utf8',
	);
}

describe('smoke cache', () => {
	test('skips a cached successful step', async () => {
		const root = await createSmokeProject();
		await recordStepSuccess(root, 'typecheck', 123);

		expect(await canSkipStep(root, 'typecheck')).toBe(true);
	});

	test('misses when a dependency changes', async () => {
		const root = await createSmokeProject();
		await recordStepSuccess(root, 'typecheck', 123);
		await writeFile(join(root, 'cli', 'src', 'index.ts'), 'export const value = 2;\n');

		expect(await canSkipStep(root, 'typecheck')).toBe(false);
	});

	test('misses fresh-release cache when public baseline content changes', async () => {
		const root = await createSmokeProject();
		await mkdir(join(root, 'docs'), { recursive: true });
		await writeFile(join(root, 'docs', 'CHANGELOG.md'), '## [2.130.1]\n');
		await recordStepSuccess(root, 'check:fresh-release', 10);
		await writeFile(join(root, 'docs', 'CHANGELOG.md'), '## [2.130.2]\n');

		expect(await canSkipStep(root, 'check:fresh-release')).toBe(false);
	});

	test('misses dead-code cache when Knip configuration changes', async () => {
		const root = await createSmokeProject();
		await recordStepSuccess(root, 'check:dead-code', 123);
		await writeFile(join(root, 'knip.jsonc'), '{"entry":["scripts/**/*.ts"]}\n');

		expect(await canSkipStep(root, 'check:dead-code')).toBe(false);
	});

	test('misses dead-code cache when analyzed source changes', async () => {
		const root = await createSmokeProject();
		await recordStepSuccess(root, 'check:dead-code', 123);
		await writeFile(join(root, 'cli', 'src', 'index.ts'), 'export const value = 2;\n');

		expect(await canSkipStep(root, 'check:dead-code')).toBe(false);
	});

	test('skips test cache when uncovered source files change', async () => {
		const root = await createSmokeProject();
		await writeCoverage(root, ['cli/src/covered.ts']);
		await recordStepSuccess(root, 'test', 123);
		await writeFile(
			join(root, 'frontend', 'src', 'App.tsx'),
			'export function App() { return "changed"; }\n',
		);

		expect(await canSkipStep(root, 'test')).toBe(true);
	});

	test('misses test cache when a covered file changes', async () => {
		const root = await createSmokeProject();
		await writeCoverage(root, ['cli/src/covered.ts']);
		await recordStepSuccess(root, 'test', 123);
		await writeFile(join(root, 'cli', 'src', 'covered.ts'), 'export const covered = 2;\n');

		expect(await canSkipStep(root, 'test')).toBe(false);
	});

	test('misses test cache when a dynamically read policy input changes', async () => {
		const root = await createSmokeProject();
		await writeCoverage(root, ['cli/src/covered.ts']);
		await recordStepSuccess(root, 'test', 123);
		await writeFile(
			join(root, 'frontend', 'src', 'pages', 'runs', 'RunsPage.tsx'),
			'export function RunsPage() { return "changed"; }\n',
		);

		expect(await canSkipStep(root, 'test')).toBe(false);
	});

	test('misses test cache when the tested CI workflow changes', async () => {
		const root = await createSmokeProject();
		await writeCoverage(root, ['cli/src/covered.ts']);
		await recordStepSuccess(root, 'test', 123);
		await writeFile(join(root, CI_WORKFLOW_TEST_INPUT), 'name: Changed CI\n');

		expect(await canSkipStep(root, 'test')).toBe(false);
	});

	test('misses test cache when an optional policy input appears', async () => {
		const root = await createSmokeProject();
		await writeCoverage(root, ['cli/src/covered.ts']);
		await recordStepSuccess(root, 'test', 123);
		await mkdir(join(root, '.aidd'), { recursive: true });
		await writeFile(join(root, '.aidd', 'assertions.md'), '# Assertions\n');

		expect(await canSkipStep(root, 'test')).toBe(false);
	});

	test('misses test cache when a dynamically read policy input is deleted', async () => {
		const root = await createSmokeProject();
		await writeCoverage(root, ['cli/src/covered.ts']);
		await recordStepSuccess(root, 'test', 123);
		await rm(join(root, 'frontend', 'src', 'pages', 'runs', 'RunsPage.tsx'));

		expect(await canSkipStep(root, 'test')).toBe(false);
	});

	test('misses test cache when a covered file is deleted', async () => {
		const root = await createSmokeProject();
		await writeCoverage(root, ['cli/src/covered.ts']);
		await recordStepSuccess(root, 'test', 123);
		await rm(join(root, 'cli', 'src', 'covered.ts'));

		expect(await canSkipStep(root, 'test')).toBe(false);
	});

	test('misses test cache when test runtime inputs change', async () => {
		const root = await createSmokeProject();
		await writeCoverage(root, ['cli/src/covered.ts']);
		await recordStepSuccess(root, 'test', 123);
		await writeFile(join(root, 'bunfig.toml'), 'env = false\n[test]\ntimeout = 1000\n');

		expect(await canSkipStep(root, 'test')).toBe(false);
	});

	test('misses test cache when a coverage threshold changes', async () => {
		const root = await createSmokeProject();
		await writeCoverage(root, ['cli/src/covered.ts']);
		await recordStepSuccess(root, 'test', 123);
		await writeFile(
			join(root, 'scripts', 'lib', 'test-coverage', 'contracts.ts'),
			'export const threshold = 90;\n',
		);

		expect(await canSkipStep(root, 'test')).toBe(false);
	});

	test('misses test cache when a tested licensing module changes', async () => {
		const root = await createSmokeProject();
		await writeCoverage(root, ['cli/src/covered.ts']);
		await recordStepSuccess(root, 'test', 123);
		await writeFile(
			join(root, 'scripts', 'lib', 'third-party-licenses', 'registry-validation.ts'),
			'export const valid = false;\n',
		);

		expect(await canSkipStep(root, 'test')).toBe(false);
	});

	test('legacy test cache entries without covered files miss once', async () => {
		const root = await createSmokeProject();
		await writeFile(
			getSmokeCachePath(root),
			JSON.stringify(
				{
					steps: {
						test: {
							dependencyHash: 'legacy',
							durationMs: 10,
							recordedAt: new Date(0).toISOString(),
							result: 'pass',
						},
					},
					updatedAt: new Date(0).toISOString(),
					version: 1,
				},
				null,
				'\t',
			),
		);

		expect(await canSkipStep(root, 'test')).toBe(false);
	});

	test('lcov source files normalize Windows and relative paths', async () => {
		const root = await createSmokeProject();
		const files = parseCoverageFiles(
			root,
			[`SF:${join(root, 'cli', 'src', 'covered.ts')}`, 'SF:frontend\\src\\App.tsx'].join(
				'\n',
			),
		);

		expect(files).toEqual(['cli/src/covered.ts', 'frontend/src/App.tsx']);
	});

	test('lcov source files outside the project root are rejected', async () => {
		const root = await createSmokeProject();
		const outside = join(tmpdir(), 'outside-coverage.ts');

		expect(() => parseCoverageFiles(root, `SF:${outside}\n`)).toThrow(
			'Coverage file is outside the project root',
		);
	});

	test('misses previous failed results', async () => {
		const root = await createSmokeProject();
		await recordStepResult(root, 'test', 'fail', 50);

		expect(await canSkipStep(root, 'test')).toBe(false);
	});

	test('force bypasses cache hits', async () => {
		const root = await createSmokeProject();
		await recordStepSuccess(root, 'build:frontend', 75);

		expect(await canSkipStep(root, 'build:frontend', true)).toBe(false);
	});

	test('always runs application guard because rogue folders are filesystem state', async () => {
		const root = await createSmokeProject();
		await recordStepSuccess(root, 'check-application', 25);
		const status = await getSmokeCacheStatus(root, ['check-application']);

		expect(await canSkipStep(root, 'check-application')).toBe(false);
		expect(status[0]?.cacheable).toBe(false);
		expect(status[0]?.valid).toBe(false);
	});

	test('reports cache status and writes to scripts', async () => {
		const root = await createSmokeProject();
		await recordStepSuccess(root, 'self-contained', 25);
		const status = await getSmokeCacheStatus(root, ['self-contained']);
		const cacheRaw = await readFile(getSmokeCachePath(root), 'utf8');

		expect(status[0]?.valid).toBe(true);
		expect(getSmokeCachePath(root).endsWith(join('scripts', 'smoke-cache.json'))).toBe(true);
		expect(cacheRaw).toContain('self-contained');
	});

	test('parses smoke wrapper flags and preserves qc step coverage order', () => {
		expect(parseSmokeQcArgs(['--force']).force).toBe(true);
		expect(parseSmokeQcArgs(['--cache-status']).cacheStatus).toBe(true);
		expect(SMOKE_QC_STEPS.map((step) => step.label)).toEqual([
			'check:max-lines',
			'check:script-targets',
			'check:smoke-docs',
			// The meta-gate's own self-test runs first: a broken rule library would otherwise be
			// reported as gate violations.
			'test:gate-conventions',
			'check:gate-conventions',
			'check:fresh-release',
			'check:web-db-integrity',
			'check:env-spread',
			'check:git-window-hide',
			'check:backend-cli-boundary',
			'check:schema-parity',
			'check:feature-integration',
			'check:artifact-parity',
			'check:audit-artifact-hygiene',
			'check:audit-profile-mapping',
			'check-application',
			'check-deps',
			'check:dead-code',
			'self-contained',
			'check:licenses',
			'prompt:snapshot:check',
			'check:leak-guard',
			'check:shared-core',
			'format:check',
			'typecheck',
			'lint',
			'bun test',
			'build:frontend',
			// Both read frontend/dist, so both must stay after the step that produces it.
			'verify-minification',
			'check:critical-path',
		]);
		expect(SMOKE_QC_STEPS.find((step) => step.name === 'test')?.command).toEqual([
			'bun',
			'run',
			'test:coverage',
		]);
	});
});
