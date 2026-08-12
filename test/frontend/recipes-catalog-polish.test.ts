import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { StepDraft } from '../../frontend/src/pages/recipes/recipe-steps.ts';

import {
	collectStepErrors,
	getConfigSummary,
	moveStep,
	newStepDraft,
	newStepNamePlaceholder,
} from '../../frontend/src/pages/recipes/recipe-steps.ts';

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
		const page = await read('pages/recipes/RecipesPage.tsx');

		// Rendered next to the grid, and only when there are buttons for it to explain.
		expect(page).toContain('{launchDisabled && filtered.length > 0 ? (');
		expect(page).toContain('id={launchHintId}');
		// The filter card no longer holds the described-by target, so the id is unique.
		expect(page.match(/id=\{launchHintId\}/g)).toHaveLength(1);
	});

	test('the button title and the notice are one string', async () => {
		const hint = await read('pages/recipes/recipe-launch.ts');
		const grid = await read('pages/recipes/RecipeGrid.tsx');
		const page = await read('pages/recipes/RecipesPage.tsx');

		expect(hint).toContain("export const launchHint = 'Choose a project to enable Launch';");
		for (const source of [grid, page]) {
			expect(source).toContain("from './recipe-launch.ts'");
			expect(stripComments(source)).not.toContain("'Choose a project to enable Launch'");
		}
		expect(grid).toContain('title={launchDisabled ? launchHint : undefined}');
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
		// `auto-fill` off a 20rem track floor rather than `xl:grid-cols-3`: the tiered count capped
		// at three, so a 1962px column drew three 643px cards for a name, a description and a step
		// count. The floor reproduces the old counts at the old widths and keeps going above them.
		expect(page).toContain('grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4');
	});
});

describe('the filter card is the same height in every state', () => {
	test('the clear-search button holds its slot instead of appearing on the first keystroke', async () => {
		const page = await read('pages/recipes/RecipesPage.tsx');
		expect(page).toContain("className={search ? '' : 'invisible'}");
		expect(page).toContain("aria-hidden={search ? undefined : 'true'}");
		// The two toggling elements were this button and a hint under the Project select; the hint
		// moved to the results, so nothing inside the card mounts on a state change any more.
		expect(stripComments(page)).not.toContain('{search ? (');
		expect(stripComments(page)).not.toContain('{launchDisabled ? (');
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
		const columns = (grid.match(/scope="col"/g) ?? []).length;

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
		expect(stripComments(panel)).not.toContain('sm:items-start');
		expect(stripComments(panel)).not.toContain('sm:justify-between');
	});

	test('opening the panel from far down the list brings it on screen', async () => {
		const panel = await read('pages/recipes/RecipeQuickLaunchPanel.tsx');

		expect(panel).toContain('<div ref={panelRef}>');
		expect(panel).toContain("node.scrollIntoView({ behavior: 'smooth', block: 'start' })");
		// Only when it is actually off-screen — the same test the Runs console applies, so a
		// selection made with the panel already in view does not move the page under the tap.
		expect(panel).toContain('rect.top < 0 || rect.top > viewportHeight');
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
		const editor = await read('pages/recipes/RecipeStepEditor.tsx');
		const form = await read('pages/recipes/detail/RecipeEditMode.tsx');

		// One step has no order, so the pair is absent rather than present and both-ends disabled.
		expect(editor).toContain('{total > 1 ? (');
		expect(editor).toContain('disabled={index === 0}');
		expect(editor).toContain('disabled={index === total - 1}');
		expect(editor).toContain('ariaLabel={`Move step ${index + 1} up`}');
		expect(form).toContain('moveStep(current, index, index + 1)');
		expect(form).toContain('moveStep(current, index, index - 1)');
		expect(form).toContain('total={steps.length}');
	});
});

describe('a new step ships its name as a suggestion', () => {
	test('the draft is nameless and the input carries the placeholder', async () => {
		const editor = await read('pages/recipes/RecipeStepEditor.tsx');

		expect(newStepDraft().name).toBe('');
		expect(newStepNamePlaceholder).toBe('New shell step');
		expect(editor).toContain('placeholder={newStepNamePlaceholder}');
		expect(editor).toContain('<FieldRow label="Step name" required>');
	});

	test('both save paths refuse a nameless step', async () => {
		const create = await read('pages/recipes/RecipeCreatePage.tsx');
		const detail = await read('pages/recipes/RecipeDetailPage.tsx');

		for (const source of [create, detail]) {
			expect(source).toContain('steps.some((step) => !step.name.trim())');
			expect(source).toContain("toast.error('Every step needs a name')");
		}
	});

	test('a JSON error on a nameless step still names the step', () => {
		const draft: StepDraft = { ...newStepDraft(), configJson: '{' };
		expect(collectStepErrors(draft).configJson).toContain('Step "Untitled step" configJson');
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
		expect(card).toContain('font-mono break-all text-foreground');
		expect(stripComments(card)).not.toContain('entry.primary');
		expect(stripComments(card)).not.toContain('bg-accent-muted');
	});

	test('a long value gets the block treatment command already had', async () => {
		const card = await read('pages/recipes/StepOverviewCard.tsx');

		expect(card).toContain("entry.key === 'command' || isBlockEntry(entry)");
		expect(card).toContain('entry.value.length > blockValueLength');
		// One code block, rendered per block entry, rather than a branch only `command` reaches.
		expect(card).toContain('{blockEntries.map((entry) => (');
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
		expect(actions).toContain('className="w-auto shrink-0"');
	});

	test('the header shares a row only after its own content can fit both sides', async () => {
		const header = await read('components/shared/PageHeader.tsx');

		// Nothing inside the actions row can absorb: the buttons are `whitespace-nowrap` and the
		// view toggle is `shrink-0`. The header therefore waits for 61rem of its own content width
		// before sharing a row, with `min-w-0` retained as the final overflow guard.
		expect(header).toContain('<header className="@container">');
		expect(header).toContain('@min-[61rem]:flex-row');
		expect(header).toContain('<div className="min-w-0">');
	});
});
