import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '../..');
const FRONTEND_SRC = join(ROOT, 'frontend/src');
// The layers every page may import from, and which therefore must not reach back into a page.
const SHARED_LAYERS = ['components', 'hooks', 'lib', 'stores', 'api', 'types'];

// A static or dynamic import whose specifier walks into a pages/ directory.
const PAGES_IMPORT = /(?:from\s+|import\(\s*)'[^']*\/pages\/[^']*'/gu;

/**
 * Shared code is what pages share; a shared module that imports from a page puts that page in
 * every other page's dependency graph (the help drawer once pulled the docs manifest into every
 * page header this way). The walk is counted so an empty tree cannot pass by accident.
 */
describe('shared layers never import from pages', () => {
	test('no file under the shared layers names a pages/ path in an import', async () => {
		const failures: string[] = [];
		let visited = 0;
		for (const layer of SHARED_LAYERS) {
			for (const file of new Bun.Glob('**/*.{ts,tsx}').scanSync(join(FRONTEND_SRC, layer))) {
				visited += 1;
				const path = join(FRONTEND_SRC, layer, file);
				const source = await readFile(path, 'utf8');
				for (const match of source.matchAll(PAGES_IMPORT))
					failures.push(`${relative(ROOT, path)}: ${match[0]}`);
			}
		}
		expect(visited).toBeGreaterThan(100);
		expect(failures).toEqual([]);
	});

	test('the detector sees both import forms', () => {
		const sample =
			"import { a } from '../../pages/docs/x.ts';\nconst b = import('../pages/y.tsx');\n";
		expect([...sample.matchAll(PAGES_IMPORT)].length).toBe(2);
		expect([..."import { c } from '../lib/z.ts';".matchAll(PAGES_IMPORT)].length).toBe(0);
	});
});
