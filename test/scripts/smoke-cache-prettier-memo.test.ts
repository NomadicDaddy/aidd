import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
	clearSmokeCacheEvaluationContext,
	collectDependencies,
	createSmokeCacheEvaluationContext,
} from '../../scripts/lib/smoke-cache/collect.ts';

import { testTempDir } from '../_helpers/temp.ts';

const normalized = (files: string[]) => files.map((file) => file.replaceAll('\\', '/'));

// Found by the 2026-10-01 QC_PIPELINE audit: one gate run enumerated the format:check input list
// three times, and each enumeration asks Prettier about every candidate file, which made the
// cache layer cost more than the steps it was skipping.
describe('smoke cache - the format:check input list', () => {
	test('is enumerated once per evaluation context and again after the context is cleared', async () => {
		const root = await testTempDir('aidd-smoke-prettier-memo-');
		await mkdir(join(root, 'scripts'), { recursive: true });
		await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n');
		await writeFile(join(root, 'scripts', 'first.ts'), 'export const first = 1;\n');
		const context = createSmokeCacheEvaluationContext();

		const before = normalized(await collectDependencies(root, 'format:check', context));
		expect(before).toContain('scripts/first.ts');

		// A file that appears while the context is live is not seen: the list is the one
		// already computed. Without the memo this second call would walk the tree again.
		await writeFile(join(root, 'scripts', 'second.ts'), 'export const second = 2;\n');
		const reused = normalized(await collectDependencies(root, 'format:check', context));
		expect(reused).toEqual(before);

		// The gate clears the context after every step it executes, which is what keeps the
		// list from outliving work that changes the file set.
		clearSmokeCacheEvaluationContext(context);
		const after = normalized(await collectDependencies(root, 'format:check', context));
		expect(after).toContain('scripts/second.ts');
	});

	test('is enumerated afresh on every call made without a context', async () => {
		const root = await testTempDir('aidd-smoke-prettier-nomemo-');
		await mkdir(join(root, 'scripts'), { recursive: true });
		await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n');
		await writeFile(join(root, 'scripts', 'first.ts'), 'export const first = 1;\n');

		await collectDependencies(root, 'format:check');
		await writeFile(join(root, 'scripts', 'second.ts'), 'export const second = 2;\n');
		const again = normalized(await collectDependencies(root, 'format:check'));
		expect(again).toContain('scripts/second.ts');
	});
});
