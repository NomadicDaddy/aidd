import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { RecipeDefinition } from '../../frontend/src/api/types.ts';

// The explainer strings are covered by recipe-badge-explainers.test.ts. What that suite cannot see
// is whether the badges on the Recipes page still carry their explainer at all, which is the part a
// refactor silently drops by swapping RecipeBadgeTooltip back to a bare Badge.
//
// There are two ways to carry it and this file pins which surface gets which. A recipe's own page
// renders the interactive form: Tooltip wraps its child in `relative inline-flex`, injects
// `tabIndex` 0, and returns the child untouched when content is empty
// (components/ui/tooltip.tsx), so hover, focus and click all reach the explainer. The catalog
// renders the `plain` form, where the explainer is a `title` and the badge is not a tab stop —
// counted live at 2250x1309, 198 of the 314 focusable elements in `main` were tooltip-only badge
// buttons, so a Launch button near the bottom of the list sat behind roughly 300 tab stops that
// did nothing. Tooltip content lives in a portal that only mounts while open and never reaches
// static markup, so both forms are checked by their trigger, not by their text.
const BADGE_CLASS =
	/inline-flex items-center gap-1\.5 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap ring-1 ring-inset/g;
const TRIGGER_ATTR = /tabindex="0"/g;
const WRAPPER_CLASS = /class="relative inline-flex max-w-full min-w-0"/g;
// The interactive trigger is a `<button>`, not a tabbable `<span>`: Tooltip puts its child in the
// tab order, and a span arrived there as an unnamed generic node.
const WRAPPED_BADGE =
	/<button class="inline-flex items-center justify-center rounded-md focus-visible:[^"]*"[^>]*><span class="inline-flex items-center gap-1\.5[^"]*">(.*?)<\/span><\/button>/g;
// The plain trigger. `Badge` spreads its extra props after `className`, so the explainer lands
// immediately after the class list.
const TITLED_BADGE =
	/<span class="inline-flex items-center gap-1\.5[^"]*" title="[^"]*">(.*?)<\/span>/g;

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
		explained: (markup.match(TITLED_BADGE) ?? []).length,
		triggers: (markup.match(TRIGGER_ATTR) ?? []).length,
		wrappers: (markup.match(WRAPPER_CLASS) ?? []).length,
	};
}

// Taxonomy badges (recipe type, step type) render a decorative `aria-hidden` glyph beside their
// label so they can stay neutral instead of spending an operational status tone. The glyph carries
// no text, so it is stripped here and only the user-facing label is compared.
function labelsFrom(markup: string, pattern: RegExp): string[] {
	return [...markup.matchAll(pattern)]
		.map((match) => (match[1] ?? '').replace(/<svg\b[\s\S]*?<\/svg>/g, ''))
		.sort();
}

const cardMarkup = renderMarkup(
	`console.log(render(h(RecipeCard, { launchDisabled: false, launchPending: false, onLaunch: () => {}, recipe: ${JSON.stringify(recipe)}, usage: undefined })));`,
);
// `RecipeTable` renders the compact list beside the desktop table in static markup, so the table
// half is sliced out here. Its own badge contract is the one under test in this file.
const tableViewMarkup = renderMarkup(
	`console.log(render(h(RecipeTable, { launchDisabled: false, launchPending: false, onLaunch: () => {}, recipes: [${JSON.stringify(recipe)}], usageByResourceId: new Map() })));`,
);
const tableMarkup = tableViewMarkup.slice(tableViewMarkup.indexOf('<table'));

describe('recipe badge tooltip wiring', () => {
	test('every badge in the card view is explained, and none of them is a tab stop', () => {
		const { badges, explained, triggers, wrappers } = counts(cardMarkup);
		expect(badges).toBeGreaterThan(0);
		expect(explained).toBe(badges);
		expect(triggers).toBe(0);
		expect(wrappers).toBe(0);
	});

	test('every badge in the table view is explained, and none of them is a tab stop', () => {
		const { badges, explained, triggers, wrappers } = counts(tableMarkup);
		expect(badges).toBeGreaterThan(0);
		expect(explained).toBe(badges);
		expect(triggers).toBe(0);
		expect(wrappers).toBe(0);
	});

	test('card view explains the type, counts, step types, contract, and policy badges', () => {
		expect(labelsFrom(cardMarkup, TITLED_BADGE)).toEqual(
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
		expect(labelsFrom(tableMarkup, TITLED_BADGE)).toEqual(
			['metadata-only', 'pipeline', 'system', ...stepTypeLabels, ...policyLabels].sort(),
		);
	});

	test('both views state the same facts about the same recipe', () => {
		const cardOnly = labelsFrom(cardMarkup, TITLED_BADGE).filter(
			(label) => !labelsFrom(tableMarkup, TITLED_BADGE).includes(label),
		);
		expect(cardOnly).toEqual(['1 parameter', '5 steps']);
	});

	test('the interactive form is still a real tooltip trigger', () => {
		// The default, which is what a recipe's own page renders. `plain` is a catalog decision and
		// the badge has to stay a live trigger everywhere it is not passed, or the explainer becomes
		// hover-only for keyboard users on the one surface where the badges are the content.
		const markup = renderMarkup(
			`console.log(render(h(RecipeBadgeTooltip, { content: 'why this badge is here' }, 'explained')));`,
		);
		expect(counts(markup)).toEqual({ badges: 1, explained: 0, triggers: 1, wrappers: 1 });
		expect(labelsFrom(markup, WRAPPED_BADGE)).toEqual(['explained']);
		expect(markup).toContain('max-sm:min-h-11 max-sm:min-w-11');
	});

	test('a recipe page keeps the interactive badges', async () => {
		// The counterpart to the two catalog assertions above: those would go on passing if `plain`
		// spread to the detail page and took every explainer out of the tab order app-wide.
		const overview = await Bun.file(
			resolve(
				import.meta.dir,
				'../../frontend/src/pages/recipes/detail/RecipeOverviewMode.tsx',
			),
		).text();
		expect(overview).toMatch(/<RecipeContractBadges recipe=\{recipe\} \/>/u);
		expect(overview).toMatch(/<RecipePolicyBadges recipe=\{recipe\} \/>/u);
	});

	test('an empty explainer leaves the badge with no trigger and no title', () => {
		// Guards the assertions above from both sides. Tooltip returns its child untouched when
		// content is empty, so an interactive badge whose explainer goes missing loses its trigger;
		// a plain one renders no `title` rather than an empty one, so the counts diverge either way.
		const interactive = renderMarkup(
			`console.log(render(h(RecipeBadgeTooltip, { content: '' }, 'orphan')));`,
		);
		expect(interactive).toContain('orphan');
		expect(counts(interactive)).toEqual({
			badges: 1,
			explained: 0,
			triggers: 0,
			wrappers: 0,
		});

		const plain = renderMarkup(
			`console.log(render(h(RecipeBadgeTooltip, { content: '', plain: true }, 'orphan')));`,
		);
		expect(plain).toContain('orphan');
		expect(counts(plain)).toEqual({ badges: 1, explained: 0, triggers: 0, wrappers: 0 });
	});
});
