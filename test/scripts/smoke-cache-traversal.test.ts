import { describe, expect, spyOn, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { collectDependencies } from '../../scripts/lib/smoke-cache/collect.ts';
import { walkCacheFiles } from '../../scripts/lib/smoke-cache/walk.ts';
import { canSkipStep, recordStepSuccess } from '../../scripts/smoke-cache.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function createProject(): Promise<string> {
	const root = await testTempDir('aidd-cache-pruning-');
	for (const directory of ['scripts', '.github/workflows', 'data/checkout/node_modules/pkg']) {
		await mkdir(join(root, directory), { recursive: true });
	}
	await writeFile(
		join(root, '.prettierignore'),
		'data/\nnode_modules/\nscripts/smoke-cache.json\n',
	);
	await writeFile(join(root, 'scripts', 'source.ts'), 'export const value = 1;\n');
	await writeFile(join(root, '.github', 'workflows', 'ci.yml'), 'name: CI\n');
	await writeFile(
		join(root, 'data', 'checkout', 'node_modules', 'pkg', 'index.ts'),
		'export {};\n',
	);
	return root;
}

describe('smoke cache traversal', () => {
	test('prunes an excluded directory before visiting its children', async () => {
		const root = await createProject();
		const visited: string[] = [];
		const files = await walkCacheFiles(root, '', true, (path) => {
			visited.push(path);
			return path === 'data';
		});
		expect(files).toContain('scripts/source.ts');
		expect(files).toContain('.github/workflows/ci.yml');
		expect(visited).toContain('data');
		expect(visited.some((path) => path.startsWith('data/'))).toBe(false);
		expect(files.some((path) => path.startsWith('data/'))).toBe(false);
	});

	test('does not swallow a maintained directory read failure', async () => {
		const root = await createProject();
		const reader = spyOn(await import('node:fs/promises'), 'readdir');
		const failure = Object.assign(new Error('maintained directory denied'), { code: 'EACCES' });
		reader.mockRejectedValueOnce(failure);
		try {
			await expect(walkCacheFiles(root, '', true, () => false)).rejects.toBe(failure);
		} finally {
			reader.mockRestore();
		}
	});

	test('keeps maintained and hidden inputs while ignored checkout changes leave the key stable', async () => {
		const root = await createProject();
		const files = await collectDependencies(root, 'format:check');
		expect(files).toContain('scripts/source.ts');
		expect(files).toContain('.github/workflows/ci.yml');
		expect(files.some((path) => path.startsWith('data/'))).toBe(false);
		await recordStepSuccess(root, 'format:check', 1);
		expect(await canSkipStep(root, 'format:check')).toBe(true);
		await writeFile(
			join(root, 'data', 'checkout', 'node_modules', 'pkg', 'index.ts'),
			'changed\n',
		);
		expect(await canSkipStep(root, 'format:check')).toBe(true);
		await writeFile(join(root, 'scripts', 'source.ts'), 'export const value = 2;\n');
		expect(await canSkipStep(root, 'format:check')).toBe(false);
	});

	test('matches declared source globs and preserves generated build consumer inputs', async () => {
		const root = await createProject();
		await mkdir(join(root, 'frontend', 'dist', 'assets'), { recursive: true });
		await writeFile(join(root, 'frontend', 'dist', 'assets', 'app.js'), 'export {};\n');
		const sourceFiles = await collectDependencies(root, 'check:max-lines');
		expect(sourceFiles).toContain('scripts/source.ts');
		expect(sourceFiles.some((path) => path.startsWith('data/'))).toBe(false);
		const buildFiles = await collectDependencies(root, 'verify-minification');
		expect(buildFiles).toContain('frontend/dist/assets/app.js');
	});
});
