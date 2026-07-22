import { describe, expect, test } from 'bun:test';

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { collectDependencies } from '../../scripts/lib/smoke-cache/collect.ts';
import { CI_WORKFLOW_TEST_INPUT } from '../../scripts/lib/smoke-cache/dependencies.ts';
import { stepOutputsExist } from '../../scripts/lib/smoke-cache/outputs.ts';
import { canSkipStep, recordStepSuccess } from '../../scripts/smoke-cache.ts';

import { testTempDir } from '../_helpers/temp.ts';

// The fixture must ignore scripts/smoke-cache.json exactly as the real repo does. Without it,
// writing the cache adds the cache file to format:check's OWN dependency set, so the recorded
// hash can never match again and every `toBe(false)` below passes regardless of what changed.
// Each test therefore asserts the unchanged-tree case first, as a positive control.
async function createCacheProject(): Promise<string> {
	const root = await testTempDir('aidd-smoke-invalidation-');
	await mkdir(join(root, '.github', 'workflows'), { recursive: true });
	await mkdir(join(root, 'test', 'scripts'), { recursive: true });
	await writeFile(join(root, '.prettierignore'), 'node_modules/\nscripts/smoke-cache.json\n');
	await writeFile(join(root, '.prettierrc'), '{}\n');
	await writeFile(join(root, 'bun.lock'), '');
	await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n');
	await writeFile(join(root, CI_WORKFLOW_TEST_INPUT), 'name: CI\n');
	await writeFile(join(root, 'test', 'scripts', 'example.ts'), 'export const value = 1;\n');
	return root;
}

describe('smoke cache invalidation surfaces', () => {
	test('misses lint cache when a linted test file changes', async () => {
		const root = await createCacheProject();
		await recordStepSuccess(root, 'lint', 123);
		expect(await canSkipStep(root, 'lint')).toBe(true);

		await writeFile(join(root, 'test', 'scripts', 'example.ts'), 'export const value = 2;\n');

		expect(await canSkipStep(root, 'lint')).toBe(false);
	});

	test('misses format cache when Prettier configuration changes', async () => {
		const root = await createCacheProject();
		await recordStepSuccess(root, 'format:check', 123);
		expect(await canSkipStep(root, 'format:check')).toBe(true);

		await writeFile(join(root, '.prettierrc'), '{"printWidth":80}\n');

		expect(await canSkipStep(root, 'format:check')).toBe(false);
	});

	// Bun.Glob skips hidden directories unless `dot: true`, so `.github/**` was invisible to the
	// format:check dependency scan while `prettier --check .` checked it: a misformatted workflow
	// could pass a cached local gate and fail only in CI.
	test('misses format cache when a Prettier-owned workflow changes', async () => {
		const root = await createCacheProject();
		await recordStepSuccess(root, 'format:check', 123);
		expect(await canSkipStep(root, 'format:check')).toBe(true);

		await writeFile(join(root, CI_WORKFLOW_TEST_INPUT), 'name: Changed CI\n');

		expect(await canSkipStep(root, 'format:check')).toBe(false);
	});

	// The fixture proves the mechanism; this proves it is wired up in the repo that ships it.
	test("tracks this repository's own workflows as format:check dependencies", async () => {
		const dependencies = await collectDependencies(process.cwd(), 'format:check');

		expect(dependencies).toContain(CI_WORKFLOW_TEST_INPUT);
	});
});

// A step's inputs being unchanged only justifies skipping it while its output still exists.
// build:frontend hashes source files exclusively, so without this check `rm -rf frontend/dist`
// leaves the hash identical and smoke:qc reports the build CACHED having emitted nothing.
describe('declared build outputs gate cache hits', () => {
	test('a step with no declared outputs is unaffected', async () => {
		const root = await testTempDir('aidd-smoke-outputs-');

		expect(await stepOutputsExist(root, 'lint')).toBe(true);
	});

	test('a missing declared output withholds the cache hit', async () => {
		const root = await testTempDir('aidd-smoke-outputs-');

		expect(await stepOutputsExist(root, 'build:frontend')).toBe(false);
	});

	test('an empty output directory withholds the cache hit', async () => {
		const root = await testTempDir('aidd-smoke-outputs-');
		await mkdir(join(root, 'frontend', 'dist'), { recursive: true });

		expect(await stepOutputsExist(root, 'build:frontend')).toBe(false);
	});

	test('a populated output directory allows the cache hit', async () => {
		const root = await testTempDir('aidd-smoke-outputs-');
		await mkdir(join(root, 'frontend', 'dist', 'assets'), { recursive: true });
		await writeFile(join(root, 'frontend', 'dist', 'assets', 'index.js'), 'export {};\n');

		expect(await stepOutputsExist(root, 'build:frontend')).toBe(true);
	});
});
