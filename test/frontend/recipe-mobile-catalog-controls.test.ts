import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { RecipeDefinition } from '../../frontend/src/api/types.ts';

function runFrontendScript(script: string): string {
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

function renderMarkup(importLine: string, body: string): string {
	return runFrontendScript(
		[
			"import { createElement as h } from 'react';",
			"import { renderToStaticMarkup } from 'react-dom/server';",
			"import { MemoryRouter } from 'react-router';",
			importLine,
			'const render = (element) => renderToStaticMarkup(h(MemoryRouter, null, element));',
			body,
		].join('\n'),
	);
}

const recipe: RecipeDefinition = {
	description: 'Card-only description',
	id: 'compact-catalog-proof',
	name: 'Compact catalog proof',
	parameters: [{ name: 'target' }],
	steps: [
		{ configJson: {}, id: 'one', name: 'One', onFailure: 'stop', stepType: 'shell' },
		{ configJson: {}, id: 'two', name: 'Two', onFailure: 'continue', stepType: 'skill' },
	],
};

describe('recipe mobile catalog controls', () => {
	test('the second view renders a compact list with identity, counts, type, and actions', () => {
		const markup = renderMarkup(
			"import { RecipeCompactList } from './src/pages/recipes/RecipeCompactList.tsx';",
			`console.log(render(h(RecipeCompactList, { launchDisabled: false, launchPending: false, onLaunch: () => {}, recipes: [${JSON.stringify(recipe)}], usageByResourceId: new Map() })));`,
		);

		expect(markup).toContain('aria-label="Compact recipe list"');
		expect(markup).toContain('Compact catalog proof');
		expect(markup).toContain('compact-catalog-proof');
		expect(markup).toContain('pipeline');
		expect(markup).toContain('2 steps');
		expect(markup).toContain('1 parameter');
		expect(markup).toContain('Launch');
		expect(markup).toContain('Details');
		expect(markup).not.toContain('Card-only description');
		expect(markup).not.toContain('failure: continue');
	});

	test('the second mode exposes an accurate selected name and title', () => {
		const markup = renderMarkup(
			"import { RecipesPageActions } from './src/pages/recipes/RecipesPageActions.tsx';",
			"console.log(render(h(RecipesPageActions, { onNew: () => {}, onReload: () => {}, recipesView: 'table', reloading: false, setRecipesView: () => {} })));",
		);

		expect(markup).toMatch(
			/<button[^>]*title="Table view"[^>]*aria-label="Table view" aria-pressed="true"/u,
		);
		expect(markup).toMatch(/<button[^>]*aria-label="Card view" aria-pressed="false"/u);
		expect(markup).toContain('max-sm:w-auto');
	});

	test('the table mode contains the compact list and the existing desktop table', () => {
		const markup = renderMarkup(
			"import { RecipeTable } from './src/pages/recipes/RecipeGrid.tsx';",
			`console.log(render(h(RecipeTable, { launchDisabled: true, launchPending: false, onLaunch: () => {}, recipes: [${JSON.stringify(recipe)}], usageByResourceId: new Map() })));`,
		);

		expect(markup).toContain('aria-label="Compact recipe list"');
		expect(markup).toContain('<table aria-label="Recipes"');
		expect(markup.match(/<button[^>]*disabled=""[^>]*>.*?Launch/gu)).toHaveLength(2);
	});

	test('the recipe view preference persists the compact-list selection', () => {
		const output = runFrontendScript(
			[
				'const values = new Map();',
				'const storage = { clear: () => values.clear(), getItem: (key) => values.get(key) ?? null, key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; }, removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value) };',
				'globalThis.localStorage = storage;',
				"globalThis.window = { localStorage: storage, location: new URL('http://localhost/') };",
				"const { usePrefsStore } = await import('./src/stores/prefsStore.ts');",
				"usePrefsStore.getState().setRecipesView('table');",
				"console.log(JSON.stringify({ state: usePrefsStore.getState().recipesView, stored: values.get('aidd-prefs') }));",
			].join('\n'),
		);
		const result = JSON.parse(output) as { state: string; stored: string };

		expect(result.state).toBe('table');
		expect(result.stored).toContain('"recipesView":"table"');
	});
});
