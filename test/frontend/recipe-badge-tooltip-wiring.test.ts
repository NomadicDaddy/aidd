import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { RecipeDefinition } from '../../frontend/src/api/types.ts';

// The explainer strings are covered by recipe-badge-explainers.test.ts. What that suite cannot see
// is whether the badges on the Recipes page are actually wrapped in a tooltip, which is the part a
// refactor silently drops by swapping RecipeBadgeTooltip back to a bare Badge. Tooltip content
// lives in a portal that only mounts while open, so it never reaches static markup — but the
// trigger does: Tooltip wraps its child in `relative inline-flex` and injects `tabIndex` 0, and it
// returns the child untouched when content is empty (components/ui/tooltip.tsx). So counting
// triggers against badges proves every badge carries a live tooltip, and the explainer suite
// proves none of the content is empty.
const BADGE_CLASS =
	/inline-flex items-center gap-1\.5 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap ring-1 ring-inset/g;
const TRIGGER_ATTR = /tabindex="0"/g;
const WRAPPER_CLASS = /class="relative inline-flex max-w-full min-w-0"/g;
// The trigger is a `<button>`, not a tabbable `<span>`: Tooltip puts every badge in the tab order,
// and a span arrived there as an unnamed generic node.
const WRAPPED_BADGE =
	/<button class="inline-flex rounded-md focus-visible:[^"]*"[^>]*><span class="inline-flex items-center gap-1\.5[^"]*">(.*?)<\/span><\/button>/g;

function renderMarkup(body: string): string {
	const script = [
		"import { createElement as h } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"import { RecipeCard, RecipeTable } from './src/pages/recipes/RecipeGrid.tsx';",
		"import { RecipeBadgeTooltip } from './src/pages/recipes/RecipeBadgeTooltip.tsx';",
		'const render = (element) => renderToStaticMarkup(h(MemoryRouter, null, element));',
		body,
	].join('\n');
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

// One recipe that lights up every badge either view can render.
const recipe: RecipeDefinition = {
	description: 'Every badge at once',
	id: 'all-badges',
	metadataOnly: true,
	name: 'All badges',
	parameters: [{ name: 'target' }],
	steps: [
		{ configJson: {}, id: 'a', name: 'A', onFailure: 'stop', stepType: 'aidd-cli' },
		{ configJson: {}, id: 'b', name: 'B', onFailure: 'continue', stepType: 'recipe-ref' },
		{
			configJson: {},
			id: 'c',
			name: 'C',
			onFailure: 'auto-fix',
			retryCount: 2,
			stepType: 'shell',
		},
		{
			configJson: { executionIntent: 'review-only', skillId: 'review' },
			id: 'd',
			name: 'D',
			onFailure: 'stop',
			stepType: 'skill',
		},
		{
			configJson: { executionIntent: 'apply-changes', skillId: 'apply' },
			id: 'e',
			name: 'E',
			onFailure: 'stop',
			stepType: 'skill',
		},
	],
	system: true,
};

// Both views carry only the policies that change what happens when a step fails; the descriptive
// rest of the summary (`failure: stop`, `skills: review`, `skills: apply`) stays on the detail page,
// where there is room to read it. One list, not two: the table used to show the whole set capped at
// two plus a `+N`, so a row led with `failure: stop (3)` — the default, true of every recipe — while
// the card beside it showed only what departed from that default.
const policyLabels = ['failure: auto-fix (1)', 'failure: continue (1)', 'retries: 2'];

// The step types a recipe is built from. Both views render them from RecipeStepTypeBadges, so the
// same recipe is no longer a `shell` recipe in the cards and an untyped row in the table.
const stepTypeLabels = ['aidd-cli', 'recipe-ref', 'shell', 'skill'];

function counts(markup: string) {
	return {
		badges: (markup.match(BADGE_CLASS) ?? []).length,
		triggers: (markup.match(TRIGGER_ATTR) ?? []).length,
		wrappers: (markup.match(WRAPPER_CLASS) ?? []).length,
	};
}

// Taxonomy badges (recipe type, step type) render a decorative `aria-hidden` glyph beside their
// label so they can stay neutral instead of spending an operational status tone. The glyph carries
// no text, so it is stripped here and only the user-facing label is compared.
function wrappedLabels(markup: string): string[] {
	return [...markup.matchAll(WRAPPED_BADGE)]
		.map((match) => (match[1] ?? '').replace(/<svg\b[\s\S]*?<\/svg>/g, ''))
		.sort();
}

const cardMarkup = renderMarkup(
	`console.log(render(h(RecipeCard, { launchDisabled: false, launchPending: false, onLaunch: () => {}, recipe: ${JSON.stringify(recipe)}, usage: undefined })));`,
);
// `RecipeTable` renders the card stack as well — the card IS this table's phone rendering, see
// table-containment — so the table half is sliced out here. Comparing the whole render against
// `cardMarkup` would be comparing the card with a copy of itself.
const tableViewMarkup = renderMarkup(
	`console.log(render(h(RecipeTable, { launchDisabled: false, launchPending: false, onLaunch: () => {}, recipes: [${JSON.stringify(recipe)}], usageByResourceId: new Map() })));`,
);
const tableMarkup = tableViewMarkup.slice(tableViewMarkup.indexOf('<table'));

describe('recipe badge tooltip wiring', () => {
	test('every badge in the card view is a tooltip trigger', () => {
		const { badges, triggers, wrappers } = counts(cardMarkup);
		expect(badges).toBeGreaterThan(0);
		expect(triggers).toBe(badges);
		expect(wrappers).toBe(badges);
	});

	test('every badge in the table view is a tooltip trigger', () => {
		const { badges, triggers, wrappers } = counts(tableMarkup);
		expect(badges).toBeGreaterThan(0);
		expect(triggers).toBe(badges);
		expect(wrappers).toBe(badges);
	});

	test('card view explains the type, counts, step types, contract, and policy badges', () => {
		expect(wrappedLabels(cardMarkup)).toEqual(
			[
				'1 parameter',
				'5 steps',
				'metadata-only',
				'pipeline',
				'system',
				...stepTypeLabels,
				...policyLabels,
			].sort(),
		);
	});

	test('table view explains the type, contract, step types, and policy badges', () => {
		// The counts are the table's own columns rather than badges, so they are the one difference
		// between the two lists — the same fact in a different shape, not a fact only one view has.
		expect(wrappedLabels(tableMarkup)).toEqual(
			['metadata-only', 'pipeline', 'system', ...stepTypeLabels, ...policyLabels].sort(),
		);
	});

	test('both views state the same facts about the same recipe', () => {
		const cardOnly = wrappedLabels(cardMarkup).filter(
			(label) => !wrappedLabels(tableMarkup).includes(label),
		);
		expect(cardOnly).toEqual(['1 parameter', '5 steps']);
	});

	test('an empty explainer leaves the badge with no tooltip trigger', () => {
		// Guards the assertions above: Tooltip returns its child untouched when content is empty,
		// so a badge whose explainer goes missing loses the trigger and the counts diverge.
		const markup = renderMarkup(
			`console.log(render(h(RecipeBadgeTooltip, { content: '' }, 'orphan')));`,
		);
		expect(markup).toContain('orphan');
		expect(counts(markup)).toEqual({ badges: 1, triggers: 0, wrappers: 0 });
	});
});
