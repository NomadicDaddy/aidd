import { afterEach, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { evaluateFrontendStaleness } from '../../backend/src/frontendStaleness.ts';

import { testTempDirSync } from '../_helpers/temp.ts';
const tmpRoots: string[] = [];

function makeRoot(): string {
	const root = testTempDirSync('aidd-staleness-');
	tmpRoots.push(root);
	return root;
}

/** Stamp a file's mtime to a fixed epoch-second value so comparisons are deterministic. */
async function writeAt(path: string, contents: string, epochSeconds: number): Promise<void> {
	await writeFile(path, contents, 'utf8');
	await utimes(path, epochSeconds, epochSeconds);
}

afterEach(() => {
	for (const root of tmpRoots.splice(0)) {
		rmSync(root, { force: true, recursive: true });
	}
});

describe('evaluateFrontendStaleness', () => {
	test('reports production when frontend/src is absent (standalone artifact)', async () => {
		const root = makeRoot();
		const dist = join(root, 'frontend', 'dist');
		await mkdir(dist, { recursive: true });
		await writeAt(join(dist, 'index.html'), '<html></html>', 1_000);

		const result = await evaluateFrontendStaleness(root);
		expect(result.status).toBe('production');
	});

	test('reports missing when src exists but dist/index.html is absent', async () => {
		const root = makeRoot();
		const src = join(root, 'frontend', 'src');
		await mkdir(src, { recursive: true });
		await writeAt(join(src, 'main.tsx'), 'export const x = 1;', 1_000);

		const result = await evaluateFrontendStaleness(root);
		expect(result.status).toBe('missing');
	});

	test('reports stale when newest source is newer than the built dist', async () => {
		const root = makeRoot();
		const src = join(root, 'frontend', 'src');
		const dist = join(root, 'frontend', 'dist');
		await mkdir(src, { recursive: true });
		await mkdir(dist, { recursive: true });
		await writeAt(join(dist, 'index.html'), '<html></html>', 1_000);
		await writeAt(join(src, 'main.tsx'), 'export const x = 2;', 2_000);

		const result = await evaluateFrontendStaleness(root);
		expect(result.status).toBe('stale');
		if (result.status === 'stale') {
			expect(result.srcModifiedAt.getTime()).toBeGreaterThan(result.distBuiltAt.getTime());
		}
	});

	test('reports fresh when dist is at least as new as the newest source', async () => {
		const root = makeRoot();
		const src = join(root, 'frontend', 'src');
		const dist = join(root, 'frontend', 'dist');
		await mkdir(src, { recursive: true });
		await mkdir(dist, { recursive: true });
		await writeAt(join(src, 'main.tsx'), 'export const x = 3;', 1_000);
		await writeAt(join(dist, 'index.html'), '<html></html>', 2_000);

		const result = await evaluateFrontendStaleness(root);
		expect(result.status).toBe('fresh');
	});
});
