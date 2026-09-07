import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { StepDraft } from '../../frontend/src/pages/recipes/recipe-steps.ts';

import { getConfigSummary } from '../../frontend/src/pages/recipes/recipe-config-summary.ts';
import {
	collectStepErrors,
	moveStep,
	newStepDraft,
	newStepNamePlaceholder,
} from '../../frontend/src/pages/recipes/recipe-steps.ts';
import { readCatalogQuery } from '../../frontend/src/lib/catalogFilterParams.ts';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(relativePath: string): Promise<string> {
	return readFile(join(frontendSource, ...relativePath.split('/')), 'utf8');
}

// A comment that explains why a class or a control was removed names it, so a test asserting
// absence has to read the code without the prose about it.
function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

describe('the launch prerequisite is stated where the dead buttons are', () => {
	test('the notice sits with the results and is what aria-describedby points at', async () => {
		const [page, toolbar] = await Promise.all([
			read('pages/recipes/RecipesPage.tsx'),
			read('pages/recipes/RecipesFilterToolbar.tsx'),
		]);

		expect(page).toContain('launchHintId={launchHintId}');
		expect(toolbar).toContain('id={launchHintId}');
		expect(toolbar).toContain('describedBy={launchHintId}');
		expect(toolbar.match(/id=\{launchHintId\}/g)).toHaveLength(1);
	});

	test('the button title and the notice are one string', async () => {
		const hint = await read('pages/recipes/recipe-launch.ts');
		const grid = await read('pages/recipes/RecipeGrid.tsx');
		const launchButton = await read('pages/recipes/RecipeLaunchButton.tsx');
		const toolbar = await read('pages/recipes/RecipesFilterToolbar.tsx');

		expect(hint).toContain("export const launchHint = 'Choose a project to enable Launch';");
		for (const source of [launchButton, toolbar]) {
			expect(source).toContain("from './recipe-launch.ts'");
			expect(stripComments(source)).not.toContain("'Choose a project to enable Launch'");
		}
		expect(grid).toContain('<RecipeLaunchButton');
		expect(launchButton).toContain('title={launchDisabled ? launchHint : undefined}');
	});
});

describe('card height is bounded by the card, not by its longest description', () => {
	test('the description clamps to two lines and keeps the full text on title', async () => {
		const grid = await read('pages/recipes/RecipeGrid.tsx');
		expect(grid).toContain('mb-4 line-clamp-2 text-sm text-muted-foreground');
		expect(grid).toContain("title={recipe.description ?? 'No description'}");
	});

	test('the grid uses the baseline gutter and a track floor, not a tiered column count', async () => {
		const page = await read('pages/recipes/RecipesPage.tsx');
		expect(page).toContain('grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4');
	});
});

describe('the filter row uses the shared catalog contract', () => {
	test('the shared toolbar owns search, count, and the stable reset affordance', async () => {
		const [filter, page] = await Promise.all([
			read('pages/recipes/RecipesFilterToolbar.tsx'),
			read('pages/recipes/RecipesPage.tsx'),
		]);

		expect(page).toContain('<RecipesFilterToolbar');
		expect(filter).toContain('<FilterToolbar');
		expect(filter).toContain('<FilterSearch');
		expect(filter).toContain('hasFilters={search.trim().length > 0}');
		expect(filter.indexOf('<RecipeProjectField')).toBeLessThan(filter.indexOf('<FilterSearch'));
		// The no-results recovery is the shared one the empty state renders from its register, so
		// there is no hand-rolled second copy to drift from the search it clears.
		expect(page).not.toContain('Clear search');
		expect(page).toContain('filters={emptyFilters}');
		expect(page).not.toContain("aria-hidden={search ? undefined : 'true'}");
	});
});

describe('both catalog views identify a recipe by the same facts', () => {
	test('step types come from one component, used by both', async () => {
		const grid = await read('pages/recipes/RecipeGrid.tsx');
		const badges = await read('pages/recipes/RecipeMetadataBadges.tsx');

		expect(badges).toContain('export function RecipeStepTypeBadges');
		// `plain` in both: the catalog's chips are facts about a row, not controls. See
		// recipe-badge-tooltip-wiring.test.ts, which owns that contract.
		expect(grid.match(/<RecipeStepTypeBadges plain recipe=\{recipe\} \/>/g)).toHaveLength(2);
		// Neither view derives the set itself any more.
		expect(stripComments(grid)).not.toContain('new Set(recipe.steps.map');
		expect(grid).toContain('Step types');
	});

	test('both views show the same policy summary', async () => {
		const grid = await read('pages/recipes/RecipeGrid.tsx');
		// Whitespace-tolerant: the table's call site is wrapped across lines by the formatter.
		expect(
			grid.match(
				/<RecipePolicyBadges\s+limit=\{3\}\s+plain\s+recipe=\{recipe\}\s+riskOnly\s*\/>/g,
			),
		).toHaveLength(2);
		expect(stripComments(grid)).not.toContain('limit={2}');
	});

	test('the table skeleton has a column per column', async () => {
		const grid = await read('pages/recipes/RecipeGrid.tsx');
		const page = await read('pages/recipes/RecipesPage.tsx');
		const columns =
			(grid.match(/scope="col"/g) ?? []).length +
			(grid.match(/<SortableColumnHeader/g) ?? []).length;

		expect(columns).toBe(8);
		expect(page).toContain(`columns={${columns}}`);
	});
});

describe('the launch panel is a titled card, not a block of loose text', () => {
	const PANELS = [
		'pages/recipes/RecipeQuickLaunchPanel.tsx',
		'pages/recipes/RecipeLaunchPanel.tsx',
	];

	test('both panels title themselves through CardHeader', async () => {
		for (const path of PANELS) {
			const panel = await read(path);
			expect(panel).toContain('<CardHeader');
			expect(panel).toContain('title={`Launch ${recipe.name}`}');
			// The hand-rolled header is what let the Close button inherit `stretch` in one copy
			// and not the other; card-header-adoption.test.ts no longer exempts either file.
			expect(stripComments(panel)).not.toContain('<h2');
		}
	});

	test('the Close button sizes to its label at every width', async () => {
		const panel = await read('pages/recipes/RecipeQuickLaunchPanel.tsx');
		// Measured at 390px before the fix: Close 324x36 against Start Session at 138x36, because
		// `items-start` was gated behind `sm:` and below it the flex default is `stretch`.
		expect(panel).toContain('aria-label={`Close launch panel for ${recipe.name}`}');
		expect(panel).toContain('<X className="h-4 w-4" />');
		expect(panel).not.toContain('className="w-full"\n\t\t\t\t\t\t\taria-label={`Close');
	});

	test('opening the panel leaves the catalog in place behind a modal', async () => {
		const panel = await read('pages/recipes/RecipeQuickLaunchPanel.tsx');

		expect(panel).toContain('<Dialog');
		expect(panel).toContain('initialFocus="container"');
		expect(panel).toContain('<DialogPanel');
		expect(stripComments(panel)).not.toContain('scrollIntoView');
	});

	test('one step is one step in both panels', async () => {
		for (const path of PANELS) {
			const panel = await read(path);
			expect(panel).toContain("recipe.steps.length === 1 ? '' : 's'");
		}
	});
});

describe('a step can be moved without being retyped', () => {
	const drafts = ['a', 'b', 'c'];

	test('moveStep reorders and leaves an out-of-range move alone', () => {
		expect(moveStep(drafts, 0, 1)).toEqual(['b', 'a', 'c']);
		expect(moveStep(drafts, 2, 0)).toEqual(['c', 'a', 'b']);
		expect(moveStep(drafts, 1, 1)).toEqual(drafts);
		// The controls are disabled at each end, so these are races, not user intent.
		expect(moveStep(drafts, 0, -1)).toEqual(drafts);
		expect(moveStep(drafts, 2, 3)).toEqual(drafts);
		// A copy either way: the caller is a setState updater and must not mutate its input.
		expect(moveStep(drafts, 0, 1)).not.toBe(drafts);
	});

	test('the editor renders the control and the form wires it to moveStep', async () => {
		const header = await read('pages/recipes/RecipeStepEditorHeader.tsx');
		const form = await read('pages/recipes/detail/RecipeEditMode.tsx');

		// One step has no order, so the pair is absent rather than present and both-ends disabled.
		expect(header).toContain('{total > 1 ? (');
		expect(header).toContain('disabled={index === 0}');
		expect(header).toContain('disabled={index === total - 1}');
		expect(header).toContain('ariaLabel={`Move step ${index + 1} up`}');
		expect(form).toContain('moveStep(current, index, index + 1)');
		expect(form).toContain('moveStep(current, index, index - 1)');
		expect(form).toContain('total={steps.length}');
	});
});

describe('a new step ships its name as a suggestion', () => {
	test('the draft is nameless and the input carries the placeholder', async () => {
		const editor = await read('pages/recipes/RecipeStepEditor.tsx');

		expect(newStepDraft().name).toBe('');
		expect(newStepNamePlaceholder('shell')).toBe('New shell step');
		expect(newStepNamePlaceholder('skill')).toBe('New skill step');
		expect(editor).toContain('placeholder={newStepNamePlaceholder(step.stepType)}');
		expect(editor).toContain('<FieldRow error={nameError} label="Step name" required>');
	});

	test('both save paths refuse a nameless step', async () => {
		const create = await read('pages/recipes/RecipeCreatePage.tsx');
		const detail = await read('pages/recipes/RecipeDetailPage.tsx');

		for (const source of [create, detail]) {
			expect(source).toContain('steps.findIndex((step) => !step.name.trim())');
			expect(source).toContain('needs a name`');
		}
	});

	test('a JSON error on a nameless step still names the step', () => {
		const draft: StepDraft = { ...newStepDraft(), configJson: '{' };
		expect(collectStepErrors(draft).configJson).toContain('Step 1 configJson');
	});
});

describe('config values get one treatment', () => {
	test('the summary carries no emphasis flag for the card to fork on', () => {
		const entries = getConfigSummary('shell', { command: 'bun test', cwd: 'frontend' });
		expect(entries.map((entry) => entry.key)).toEqual(['command', 'cwd']);
		for (const entry of entries) {
			expect(entry).not.toHaveProperty('primary');
		}
	});

	test('chips are one neutral treatment with the value in mono', async () => {
		const card = await read('pages/recipes/StepOverviewCard.tsx');

		expect(card).toContain(
			'inline-flex max-w-full min-w-0 items-start gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground',
		);
		expect(card).toContain('font-mono break-words text-foreground');
		expect(stripComments(card)).not.toContain('entry.primary');
		expect(stripComments(card)).not.toContain('bg-accent-muted');
	});

	test('a long value gets the block treatment command already had', async () => {
		const card = await read('pages/recipes/StepOverviewCard.tsx');

		expect(card).toContain("entry.key === 'command' || isBlockEntry(entry)");
		expect(card).toContain('entry.value.length > blockValueLength');
		// One code block, rendered per block entry, rather than a branch only `command` reaches.
		expect(card).toContain('{leadingBlockEntries.map(renderBlock)}');
		expect(card).toContain('{trailingBlockEntries.map(renderBlock)}');
		expect(stripComments(card)).not.toContain(
			"entries.find((entry) => entry.key === 'command')",
		);
	});
});

describe('the header actions fit on the width where they first share a line', () => {
	test('the actions remain one complete unit at every header composition', async () => {
		const actions = await read('pages/recipes/RecipesPageActions.tsx');

		// The 330px cluster does not shrink or wrap internally. Below the shared header's content
		// threshold it receives its own row; above it the title and actions have room to coexist.
		expect(actions).toContain('<div className="flex shrink-0 flex-nowrap items-center gap-2">');
		expect(actions).toContain('className="shrink-0 max-sm:w-auto"');
	});

	test('the header shares a row only after its own content can fit both sides', async () => {
		const header = await read('components/shared/PageHeader.tsx');

		// Nothing inside the actions row can absorb: the buttons are `whitespace-nowrap` and the
		// view toggle is `shrink-0`. The header therefore waits for 61rem of its own content width
		// before sharing a row, with `min-w-0` retained as the final overflow guard.
		expect(header).toContain(
			'<header className="@container relative z-10" data-content-rail={rail}>',
		);
		expect(header).toContain('const rail = useContentRail();');
		expect(header).toContain('@min-[61rem]:flex-row');
		expect(header).toContain('<div className="min-w-0">');
	});
});

describe('the recipes search filter is URL-backed', () => {
	test('q is derived from the search params, not component state', async () => {
		const page = await read('pages/recipes/RecipesPage.tsx');

		// Deriving the filter from the router is the whole contract: a filtered view can be
		// bookmarked, shared, restored, and traversed with browser history. The project target,
		// selected recipe, and parameters stay local — the audit finding named exactly that
		// boundary.
		expect(page).toContain('useSearchParams()');
		expect(page).toContain('readCatalogQuery(searchParams)');
		// The search filter is no longer useState: local state would fork from the URL the
		// moment a back/forward navigation restored a previous entry.
		expect(
			page.match(/useState(<[^>]*>)?\(\s*''\s*\)/g)?.some((match) => /search/i.test(match)) ??
				false,
		).toBe(false);
	});

	test('the search writer goes through the shared param helper', async () => {
		const page = await read('pages/recipes/RecipesPage.tsx');

		expect(page).toContain('catalogFilterSearchParams(previous, { q: value })');
		// Replace, not push: typing a query writes one entry per keystroke into history otherwise.
		expect(page.match(/replace: true/g)).toHaveLength(1);
	});

	test('the initial query and a populated one read from the URL', () => {
		expect(readCatalogQuery(new URLSearchParams(''))).toBe('');
		expect(readCatalogQuery(new URLSearchParams('q=deploy'))).toBe('deploy');
	});
});
