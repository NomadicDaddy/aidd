import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { RecipeDefinition } from '../../frontend/src/api/types.ts';

import {
	recipeLaunchBlocker,
	resolveRecipeLaunchProject,
} from '../../frontend/src/pages/recipes/recipe-launch.ts';

const applyUiRecipe: RecipeDefinition = {
	description: 'Apply a supplied UI.',
	id: 'apply-ui',
	name: 'apply ui',
	parameters: [
		{ description: 'Target application name', name: 'application' },
		{
			description:
				'Path to the source UI: a screenshot directory, HTML/JSX file, template repo root, or written redesign spec',
			name: 'source',
		},
	],
	steps: [{ configJson: {}, id: 'apply', name: 'Apply UI', stepType: 'skill' }],
};

const launchProjects = [
	{ id: 'aidd', name: 'aidd control panel', path: 'D:/applications/aidd' },
	{ id: 'spernakit', name: 'Spernakit template', path: 'D:/applications/spernakit' },
];

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
			"import { QueryClient, QueryClientProvider } from '@tanstack/react-query';",
			"import { createElement as h } from 'react';",
			"import { renderToStaticMarkup } from 'react-dom/server';",
			"import { MemoryRouter } from 'react-router';",
			importLine,
			'const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });',
			'const render = (element) => renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, null, element)));',
			body,
		].join('\n'),
	);
}

function read(path: string): Promise<string> {
	return Bun.file(resolve(import.meta.dir, '../../frontend/src', ...path.split('/'))).text();
}

describe('recipe launch readiness', () => {
	test('matches the runtime rule that parameters without defaults are required', () => {
		expect(recipeLaunchBlocker(applyUiRecipe, {}, '')).toBe(
			'Choose a project before starting this recipe.',
		);
		expect(recipeLaunchBlocker(applyUiRecipe, {}, 'D:/applications/aidd')).toBe(
			'Enter source before starting this recipe.',
		);
		expect(recipeLaunchBlocker(applyUiRecipe, { source: '   ' }, 'project')).toBe(
			'Enter source before starting this recipe.',
		);
		expect(recipeLaunchBlocker(applyUiRecipe, { source: './mockup' }, 'project')).toBeNull();
	});

	test('does not block an omitted parameter that has a default', () => {
		const recipe: RecipeDefinition = {
			...applyUiRecipe,
			parameters: [{ defaultValue: 'desktop', name: 'mode' }],
		};
		expect(recipeLaunchBlocker(recipe, {}, 'project')).toBeNull();
	});

	test('resolves launch paths only to currently discovered projects', () => {
		expect(resolveRecipeLaunchProject(launchProjects, 'D:/applications/aidd')).toEqual(
			launchProjects[0]!,
		);
		expect(resolveRecipeLaunchProject(launchProjects, 'D:/applications/missing')).toBeNull();
		expect(resolveRecipeLaunchProject(launchProjects, '')).toBeNull();
	});
});

describe('recipe launch accessibility', () => {
	test('names the panel, explains Source persistently, and exposes blocked readiness', () => {
		const markup = renderMarkup(
			"import { RecipeQuickLaunchPanel } from './src/pages/recipes/RecipeQuickLaunchPanel.tsx';",
			`console.log(render(h(RecipeQuickLaunchPanel, { launchBlockedBy: 'Enter source before starting this recipe.', launchPending: false, launchTarget: {}, onClose: () => {}, onLaunch: () => {}, onLaunchTargetChange: () => {}, parameters: {}, panelId: 'recipe-launch-panel', projectDir: 'D:/applications/aidd', projects: ${JSON.stringify(launchProjects)}, recipe: ${JSON.stringify(applyUiRecipe)}, setParameters: () => {}, setProjectDir: () => {} })));`,
		);

		expect(markup).toContain('role="dialog"');
		expect(markup).toContain('tabindex="-1"');
		expect(markup).toContain('aria-labelledby=');
		expect(markup).toContain('id="recipe-launch-panel"');
		expect(markup).toContain('max-w-lg');
		expect(markup).not.toContain('max-w-[61rem]');
		expect(markup).toContain('aria-required="true"');
		expect(markup).toContain('Path to the source UI:');
		expect(markup).toContain('Required to start this recipe.');
		expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>.*Start Session/su);
		expect(markup).toContain('Enter source before starting this recipe.');
		expect(markup).toContain('aria-label="Close launch panel for apply ui"');
		expect(markup).toContain('aria-haspopup="dialog"');
		expect(markup).toContain('1 ordered step will run in aidd control panel.');
		expect(markup).toMatch(
			/<option value="D:\/applications\/aidd" selected="">aidd control panel<\/option>/u,
		);
		expect(markup).toContain('Schedule');
		expect(markup).toContain('Cancel');
		expect(markup).toContain('Launch target:');
	});

	test('expands only recipes with multiple operator parameters', () => {
		const recipe: RecipeDefinition = {
			...applyUiRecipe,
			parameters: [{ name: 'deployCommand' }, { name: 'healthUrl' }],
		};
		const markup = renderMarkup(
			"import { RecipeQuickLaunchPanel } from './src/pages/recipes/RecipeQuickLaunchPanel.tsx';",
			`console.log(render(h(RecipeQuickLaunchPanel, { launchBlockedBy: null, launchPending: false, launchTarget: {}, onClose: () => {}, onLaunch: () => {}, onLaunchTargetChange: () => {}, parameters: {}, panelId: 'recipe-launch-panel', projectDir: 'D:/applications/aidd', projects: ${JSON.stringify(launchProjects)}, recipe: ${JSON.stringify(recipe)}, setParameters: () => {}, setProjectDir: () => {} })));`,
		);

		expect(markup).toContain('max-w-2xl');
		expect(markup).toContain('@min-[32rem]:grid-cols-2');
		expect(markup).toContain('>deployCommand<');
		expect(markup).toContain('>healthUrl<');
		expect(markup).toContain('normal-case');
	});

	test('keeps an unresolved project visible and blocks launch inside the panel', () => {
		const markup = renderMarkup(
			"import { RecipeQuickLaunchPanel } from './src/pages/recipes/RecipeQuickLaunchPanel.tsx';",
			`console.log(render(h(RecipeQuickLaunchPanel, { launchBlockedBy: 'Choose a project before starting this recipe.', launchPending: false, launchTarget: {}, onClose: () => {}, onLaunch: () => {}, onLaunchTargetChange: () => {}, parameters: {}, panelId: 'recipe-launch-panel', projectDir: '', projects: ${JSON.stringify(launchProjects)}, recipe: ${JSON.stringify(applyUiRecipe)}, setParameters: () => {}, setProjectDir: () => {} })));`,
		);

		expect(markup).toContain('1 ordered step needs a target project before launch.');
		expect(markup).toContain('Select target project');
		expect(markup).toContain('Choose a project before starting this recipe.');
		expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>.*Start Session/su);
	});

	test('gives both same-named panels the same target, schedule, and dismiss capabilities', async () => {
		const [quick, detail, form, page] = await Promise.all([
			read('pages/recipes/RecipeQuickLaunchPanel.tsx'),
			read('pages/recipes/RecipeLaunchPanel.tsx'),
			read('pages/recipes/RecipeLaunchForm.tsx'),
			read('pages/recipes/RecipesPage.tsx'),
		]);

		for (const panel of [quick, detail]) {
			expect(panel).toContain('<RecipeLaunchForm');
			expect(panel).toContain('<X className="h-4 w-4" />');
		}
		expect(form).toContain('<LaunchTargetControl');
		expect(form).toContain("className={buttonClassName('secondary')}");
		expect(form).toContain('Schedule');
		expect(form).toContain('Cancel');
		expect(page).toContain('projectDir: targetProject.path');
		expect(page).toContain('onLaunchTargetChange={setLaunchTarget}');
	});

	test('moves focus into each launch surface and restores it to each trigger', async () => {
		const [quick, detail, page, overview] = await Promise.all([
			read('pages/recipes/RecipeQuickLaunchPanel.tsx'),
			read('pages/recipes/RecipeLaunchPanel.tsx'),
			read('pages/recipes/RecipesPage.tsx'),
			read('pages/recipes/detail/RecipeOverviewMode.tsx'),
		]);

		expect(quick).toContain('<Dialog');
		expect(quick).toContain('initialFocus="container"');
		expect(quick).toContain('aria-label={`Close launch panel for ${recipe.name}`}');
		expect(detail).toContain('role="region"');
		expect(detail).toContain('tabIndex={-1}');
		expect(detail).toContain('focus({ preventScroll: true })');
		expect(detail).toContain('aria-label={`Close launch panel for ${recipe.name}`}');
		expect(page).toContain('launchTriggerRef.current = trigger');
		expect(page).toContain('launchTriggerRef.current?.focus()');
		expect(overview).toContain('ref={launchTriggerRef}');
		expect(overview).toContain('launchTriggerRef.current?.focus()');
	});

	test('gives every repeated catalog action recipe-specific names', async () => {
		const [button, grid, compact] = await Promise.all([
			read('pages/recipes/RecipeLaunchButton.tsx'),
			read('pages/recipes/RecipeGrid.tsx'),
			read('pages/recipes/RecipeCompactList.tsx'),
		]);

		expect(button).toContain('aria-label={`Launch ${recipe.name}`}');
		expect(grid.match(/aria-label=\{`View details for \$\{recipe\.name\}`\}/g)).toHaveLength(2);
		expect(compact).toContain('aria-label={`View details for ${recipe.name}`}');
	});
});

describe('new recipe parameter state', () => {
	test('states that an empty parameter list is intentional', async () => {
		const parameters = await read('pages/recipes/detail/RecipeParametersCard.tsx');

		expect(parameters).toContain('{parameters.length === 0 ? (');
		expect(parameters).toContain('No parameters yet. Add one to make this recipe reusable.');
	});
});
