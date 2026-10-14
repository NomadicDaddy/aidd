import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { formatCacheKey, formatCacheLocation } from '../../scripts/run-format.ts';

import { testTempDir } from '../_helpers/temp.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');

async function fixture(): Promise<string> {
	const root = await testTempDir('aidd-run-format-');
	await mkdir(join(root, 'frontend', 'src', 'styles'), { recursive: true });
	await writeFile(join(root, 'bun.lock'), '{"lockfileVersion":1}\n');
	await writeFile(join(root, '.prettierrc'), '{"useTabs":true}\n');
	await writeFile(join(root, '.prettierignore'), 'dist\n');
	await writeFile(join(root, 'frontend', 'src', 'index.css'), '@import "tailwindcss";\n');
	await writeFile(join(root, 'frontend', 'src', 'styles', 'theme.css'), ':root{}\n');
	await writeFile(join(root, 'frontend', 'src', 'main.ts'), 'export const main = 1;\n');
	return root;
}

// Found by the 2026-10-12 QC_PIPELINE audit: Prettier's result cache does not key on plugin code
// or on the stylesheet prettier-plugin-tailwindcss reads, so a plugin bump or a class-order edit
// replayed a stale pass over every unchanged file. The cache location now carries those inputs.
describe('run-format cache location', () => {
	test('changes when bun.lock changes', async () => {
		const root = await fixture();
		const before = formatCacheLocation(await formatCacheKey(root));
		await writeFile(join(root, 'bun.lock'), '{"lockfileVersion":1,"bumped":true}\n');
		expect(formatCacheLocation(await formatCacheKey(root))).not.toBe(before);
	});

	test('changes when a frontend/src css file changes', async () => {
		const root = await fixture();
		const before = formatCacheLocation(await formatCacheKey(root));
		await writeFile(join(root, 'frontend', 'src', 'styles', 'theme.css'), ':root{--x:1}\n');
		expect(formatCacheLocation(await formatCacheKey(root))).not.toBe(before);
	});

	test('is stable when an unrelated .ts file changes', async () => {
		const root = await fixture();
		const before = formatCacheLocation(await formatCacheKey(root));
		await writeFile(join(root, 'frontend', 'src', 'main.ts'), 'export const main = 2;\n');
		expect(formatCacheLocation(await formatCacheKey(root))).toBe(before);
	});

	test('names a 16-hex-character file under node_modules/.cache/prettier-runs', async () => {
		const location = formatCacheLocation(await formatCacheKey(await fixture()));
		expect(location).toMatch(/^node_modules\/\.cache\/prettier-runs\/[0-9a-f]{16}$/);
	});

	test('is no longer hard-coded into the package scripts', async () => {
		const pkg = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8')) as {
			scripts: Record<string, string>;
		};
		expect(pkg.scripts['format:check']).toBe('bun scripts/run-format.ts --check');
		expect(pkg.scripts['format:check']).not.toContain('--cache-location');
		expect(pkg.scripts['format']).toBe('bun scripts/run-format.ts --write');
	});
});
