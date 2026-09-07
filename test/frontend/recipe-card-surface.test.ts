import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

/**
 * Renders a short recipe card and a tall one side by side. The two together are the case the sweep
 * flagged: content lengths differ, but both cards must fill the row and align their action footers.
 */
function renderCards(): { short: string; tall: string } {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { RecipeCard } from './src/pages/recipes/RecipeGrid.tsx';

const shortRecipe = {
	id: 'spernakit-release',
	name: 'spernakit release',
	parameters: [],
	steps: [{ configJson: {}, id: 'a', name: 'Release', stepType: 'shell' }],
};

const tallRecipe = {
	id: 'full-pipeline',
	name: 'full pipeline',
	description: 'A description long enough to wrap onto several lines and set the row height for every card beside it in the grid.',
	parameters: [{ name: 'application', required: true }, { name: 'scope', required: false }],
	steps: [
		{ configJson: {}, id: 'a', name: 'One', onFailure: 'auto-fix', retryCount: 2, stepType: 'shell' },
		{ configJson: { executionIntent: 'apply-changes', skillId: 'apply' }, id: 'b', name: 'Two', stepType: 'skill' },
		{ configJson: {}, id: 'c', name: 'Three', stepType: 'coding' },
	],
};

function render(recipe) {
	return renderToStaticMarkup(
		createElement(
			MemoryRouter,
			null,
			createElement(RecipeCard, {
				launchDisabled: false,
				launchPending: false,
				onLaunch: () => {},
				recipe,
				usage: undefined,
			}),
		),
	);
}

console.log(JSON.stringify({ short: render(shortRecipe), tall: render(tallRecipe) }));
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
	return JSON.parse(new TextDecoder().decode(result.stdout)) as { short: string; tall: string };
}

describe('recipe card surface', () => {
	const { short, tall } = renderCards();

	test('renders on the app Card surface rather than a hand-rolled outline', () => {
		for (const markup of [short, tall]) {
			// Card's own classes: the fill and radius the rest of the app uses. The previous
			// `rounded-md border` div had no fill at all, so the grid read as outlines on canvas.
			expect(markup).toContain('rounded-xl');
			expect(markup).toContain('bg-card');
			expect(markup).toContain('shadow-sm');
			expect(markup).not.toContain('class="rounded-md border border-border p-4"');
		}
	});

	test('fills its row and pins actions below content of different lengths', () => {
		for (const markup of [short, tall]) {
			expect(markup).toContain('flex h-full flex-col');
			expect(markup).toContain('mt-auto mb-3 text-xs text-muted-foreground');
			expect(markup).toContain('flex flex-wrap gap-2 border-t border-border pt-3');
		}
	});

	test('keeps the actions present regardless of body length', () => {
		for (const markup of [short, tall]) {
			expect(markup).toContain('Launch');
			expect(markup).toContain('Details');
		}
		// The tall card really is the taller one — otherwise the stretched-row case is untested.
		expect(tall.length).toBeGreaterThan(short.length);
	});
});
