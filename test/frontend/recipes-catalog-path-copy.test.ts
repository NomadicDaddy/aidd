import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

const repoRoot = join(import.meta.dir, '..', '..');

describe('the Recipes empty state names the live catalog', () => {
	test('uses the root recipes directory and preserves both recovery actions', async () => {
		const [docs, page] = await Promise.all([
			readFile(join(repoRoot, 'frontend', 'content', 'docs', 'recipes.md'), 'utf8'),
			readFile(
				join(repoRoot, 'frontend', 'src', 'pages', 'recipes', 'RecipesPage.tsx'),
				'utf8',
			),
		]);

		expect(docs).toContain("aidd's local `recipes/` directory");
		expect(page).toContain("aidd's local recipes/ directory");
		expect(page).not.toContain('.aidd/recipes/');
		expect(page.match(/New Recipe/g)).toHaveLength(1);
		expect(page.match(/Reload recipes/g)).toHaveLength(1);
	});
});
