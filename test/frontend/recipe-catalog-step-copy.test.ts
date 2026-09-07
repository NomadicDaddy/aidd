import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { RecipeDefinition } from '../../frontend/src/api/types.ts';

const catalogRecipes: RecipeDefinition[] = [
	{
		id: 'single-step-recipe',
		name: 'Single-step recipe',
		parameters: [],
		steps: [{ configJson: {}, id: 'only', name: 'Only step', stepType: 'shell' }],
	},
	{
		id: 'pipeline-recipe',
		name: 'Pipeline recipe',
		parameters: [],
		steps: [
			{ configJson: {}, id: 'first', name: 'First step', stepType: 'shell' },
			{ configJson: {}, id: 'second', name: 'Second step', stepType: 'shell' },
		],
	},
];

function renderRecipesPage(recipesView: 'grid' | 'table'): string {
	const script = String.raw`
import { mock } from 'bun:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

const recipes = ${JSON.stringify(catalogRecipes)};
mock.module('./src/hooks/useProjects.ts', () => ({
	useProjectNames: () => ({ data: { projects: [] } }),
}));
mock.module('./src/hooks/useRecipes.ts', () => ({
	useRecipes: () => ({
		launchRecipe: { isPending: false, mutate: () => {} },
		recipes: { data: recipes, isLoading: false },
		reloadRecipes: { isPending: false, mutate: () => {} },
	}),
}));
mock.module('./src/hooks/useTelemetry.ts', () => ({
	useTelemetryResources: () => ({ data: [] }),
}));
mock.module('./src/stores/prefsStore.ts', () => ({
	usePrefsStore: (selector) => selector({ recipesView: ${JSON.stringify(recipesView)}, setRecipesView: () => {} }),
}));

const { RecipesPage } = await import('./src/pages/recipes/RecipesPage.tsx');
console.log(renderToStaticMarkup(h(MemoryRouter, null, h(RecipesPage))));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(new TextDecoder().decode(result.stderr));
	}
	return new TextDecoder().decode(result.stdout).trim();
}

describe('recipe catalog step copy', () => {
	const cardMarkup = renderRecipesPage('grid');
	const tableMarkup = renderRecipesPage('table');

	test('describes the complete file-backed catalog without calling every recipe multi-step', () => {
		for (const markup of [cardMarkup, tableMarkup]) {
			expect(markup).toContain('File-backed recipes from the local recipes directory.');
			expect(markup).not.toContain('File-backed multi-step recipes');
		}
	});

	test('distinguishes one-step recipes from multi-step pipelines in both catalog views', () => {
		for (const markup of [cardMarkup, tableMarkup]) {
			expect(markup).toContain('single-step');
			expect(markup).toContain('1 step');
			expect(markup).toContain('pipeline');
			expect(markup).toContain('2 steps');
		}
	});
});
