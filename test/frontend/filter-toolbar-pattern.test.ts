import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { FILTER_FIELD_ORDER } from '../../frontend/src/lib/filterFields.ts';
import { formGridMeasureClass } from '../../frontend/src/lib/formStyles.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const SRC_ROOT = join(FRONTEND_ROOT, 'src');

function source(relative: string): string {
	return readFileSync(join(SRC_ROOT, relative), 'utf8');
}

// Every filter row in the app, in the order an operator meets them.
const TOOLBARS = [
	'pages/runs/RunFilters.tsx',
	'pages/projects/ProjectsToolbar.tsx',
	'pages/projects/profileMatrix/ProfileMatrixToolbar.tsx',
	'pages/projects/detail/FeatureFilters.tsx',
	'pages/projects/detail/DependencyGraphFilters.tsx',
	'pages/projects/detail/AuditsTab.tsx',
	'pages/audits/tabs/CatalogToolbar.tsx',
	'pages/audits/tabs/OverridesTab.tsx',
	'pages/audits/tabs/ApplicabilityTab.tsx',
	'pages/skills/SkillsFilterToolbar.tsx',
	'pages/recipes/RecipesFilterToolbar.tsx',
];

// Skills keeps a content-width threshold because its seven-option segmented control needs more
// room than a select. Recipes has only Search after its launch target moved into the toolbar
// header, and Applicability has only Search after its matrix legend moved out of the toolbar and
// down to the matrix it decodes — so none of the three has a multi-column filter row to compare
// against the shared tiers.
const SINGLE_CONTROL_TOOLBARS = new Set([
	'pages/audits/tabs/ApplicabilityTab.tsx',
	'pages/recipes/RecipesFilterToolbar.tsx',
	'pages/skills/SkillsFilterToolbar.tsx',
]);
const VIEWPORT_GRID_TOOLBARS = TOOLBARS.filter((file) => !SINGLE_CONTROL_TOOLBARS.has(file));

/** The labels a toolbar renders, in the order its JSX declares them. */
function fieldLabels(text: string, file = ''): string[] {
	const labels = Array.from(
		text.matchAll(/<FilterSelect\b[\s\S]*?\blabel="([^"]+)"/g),
		(match) => match[1],
	).filter((label): label is string => label !== undefined);
	const filterLabels =
		file === 'pages/audits/tabs/OverridesTab.tsx'
			? labels.filter((label) => label !== 'Project')
			: labels;
	if (file === 'pages/skills/SkillsFilterToolbar.tsx') filterLabels.push('Category');

	// Mobile-disclosure consumers pass their secondary elements through a named prop before the
	// rendered Search child. Runtime order remains Search first, so model the elements rather than
	// their prop declaration order. Matching FilterSelect directly also keeps unrelated aria-labels
	// on the surrounding page out of this inventory.
	return text.includes('<FilterSearch') ? ['Search', ...filterLabels] : filterLabels;
}

function isSubsequence(candidate: string[], order: readonly string[]): boolean {
	let cursor = 0;
	for (const field of candidate) {
		const found = order.indexOf(field, cursor);
		if (found === -1) return false;
		cursor = found + 1;
	}
	return true;
}

function toolbarColumns(text: string): string | undefined {
	const match = /columns=(?:"([^"]+)"|{`([^`]+)`})/.exec(text);
	return (match?.[1] ?? match?.[2])?.replace('${formGridMeasureClass}', formGridMeasureClass);
}

describe('one filter toolbar, eleven times', () => {
	test('every filter row renders through the shared toolbar', () => {
		const missing = TOOLBARS.filter((file) => !source(file).includes('<FilterToolbar'));

		expect(missing).toEqual([]);
	});

	test('no toolbar hand-rolls a labelled control any more', () => {
		// Six copies of `<label className="space-y-1"><span className={fieldLabelClass}>` is how
		// six toolbars came to disagree about field order, about whether the readout existed, and
		// about whether the reset button was in the card header or under the controls.
		const offenders = TOOLBARS.filter((file) => {
			const text = source(file);
			return text.includes('fieldLabelClass') || text.includes('selectClass');
		});

		expect(offenders).toEqual([]);
	});

	test('every toolbar orders its fields as a subsequence of the house order', () => {
		const wrong: string[] = [];
		for (const file of TOOLBARS) {
			const labels = fieldLabels(source(file), file);
			if (labels.length === 0) wrong.push(`${file}: no fields found`);
			else if (!isSubsequence(labels, FILTER_FIELD_ORDER))
				wrong.push(`${file}: ${labels.join(' · ')}`);
		}

		expect(wrong).toEqual([]);
	});

	test('the two converted catalogs follow the shared field order', () => {
		const recipes = source('pages/recipes/RecipesFilterToolbar.tsx');
		const skills = source('pages/skills/SkillsFilterToolbar.tsx');

		expect(fieldLabels(skills, 'pages/skills/SkillsFilterToolbar.tsx')).toEqual([
			'Search',
			'Category',
		]);
		expect(fieldLabels(recipes, 'pages/recipes/RecipesFilterToolbar.tsx')).toEqual(['Search']);
		expect(skills.indexOf('<FilterSearch')).toBeLessThan(
			skills.indexOf('<FieldRow group label="Category">'),
		);
		expect(recipes.indexOf('<RecipeProjectField')).toBeLessThan(
			recipes.indexOf('<FilterSearch'),
		);
	});

	test('every toolbar reaches its multi-column row at the same width', () => {
		// Viewport steps let the expanded navigation take back the width they appeared to add. The
		// row now has two content-width tiers: two-up at 36rem and the full row at 64rem.
		const allowed = /^(?:@min-\[36rem\]:grid-cols-2|@min-\[64rem\]:grid-cols-\S+)$/;
		const wrong: string[] = [];

		for (const file of VIEWPORT_GRID_TOOLBARS) {
			const value = toolbarColumns(source(file));
			if (value === undefined) {
				wrong.push(`${file}: no columns prop`);
				continue;
			}
			const offending = value
				.split(/\s+/)
				.filter((utility) => utility !== formGridMeasureClass && !allowed.test(utility));
			if (offending.length > 0) wrong.push(`${file}: ${offending.join(' ')}`);
		}

		expect(wrong).toEqual([]);
	});

	test('the shared component documents the tier it wants copied', () => {
		const toolbar = source('components/shared/FilterToolbar.tsx');

		// The contract a shared component prints is the contract its consumers paste.
		expect(toolbar).toContain(
			'`@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-[2fr_1fr_1fr_1fr]`',
		);
	});

	test('the two Project Detail tabs that share four filters share their order', () => {
		// Features read Search · Status · Milestone · Source and Dependencies read Search · Status ·
		// Source · Milestone. Two tabs of one page, and switching between them moved the select the
		// operator had just used.
		const features = fieldLabels(source('pages/projects/detail/FeatureFilters.tsx'));
		const graph = fieldLabels(source('pages/projects/detail/DependencyGraphFilters.tsx'));

		expect(features).toEqual(['Search', 'Status', 'Priority', 'Milestone', 'Source']);
		expect(features.filter((label) => label !== 'Priority')).toEqual(
			graph.filter((label) => label !== 'Order'),
		);
	});

	test('State sits in the same place on both audit surfaces', () => {
		const project = fieldLabels(source('pages/projects/detail/AuditsTab.tsx'));
		const catalog = fieldLabels(source('pages/audits/tabs/CatalogToolbar.tsx'));

		expect(project).toEqual(['Search', 'State']);
		expect(catalog.slice(0, 2)).toEqual(['Search', 'State']);
	});
});

describe('the readout is mounted before the filter changes', () => {
	test('the toolbar renders its status region unconditionally', () => {
		const toolbar = `${source('components/shared/FilterToolbar.tsx')}\n${source(
			'components/shared/FilterToolbarReadout.tsx',
		)}`;
		const statusIndex = toolbar.indexOf('role="status"');
		const readout = toolbar.slice(statusIndex - 400, statusIndex);

		expect(statusIndex).toBeGreaterThan(-1);
		// A live region announces changes to a region that was already in the DOM. Rendered only
		// when `hasFilters`, it mounts at the same moment its text first appears, which is the one
		// arrangement that reliably says nothing.
		expect(readout).not.toContain('hasFilters ?');
		expect(toolbar).toContain('{readoutLabel} {filtered} of {total} {noun}');
		expect(toolbar).toContain(
			'ml-auto flex max-w-full shrink-0 items-center justify-end gap-3 text-xs text-muted-foreground tabular-nums',
		);
		expect(toolbar).toContain('text-xs font-normal text-muted-foreground tabular-nums');
	});

	test('the desktop readout shares the control row while broad actions stack separately', () => {
		const toolbar = source('components/shared/FilterToolbar.tsx');
		const stackedActionsSource = source('components/shared/FilterToolbarStackedActions.tsx');
		const catalog = source('pages/audits/tabs/CatalogToolbar.tsx');
		const row = toolbar.indexOf("'flex flex-col @min-[64rem]:flex-row @min-[64rem]:items-end'");
		const controls = toolbar.indexOf("'grid min-w-0 flex-1'", row);
		const readout = toolbar.indexOf('<FilterToolbarReadout', controls);
		const stackedActions = toolbar.indexOf("actions && actionLayout === 'stacked'", readout);

		expect(toolbar).toContain("'flex flex-col @min-[64rem]:flex-row @min-[64rem]:items-end'");
		expect(toolbar).toContain('gapClass,');
		expect(controls).toBeGreaterThan(row);
		expect(readout).toBeGreaterThan(controls);
		expect(stackedActions).toBeGreaterThan(readout);
		expect(catalog).toContain('actionLayout="stacked"');
		expect(stackedActionsSource).toContain('aria-controls={panelId}');
		expect(stackedActionsSource).toContain("open ? 'flex' : 'hidden'");
	});

	test('the reset control is disabled rather than unmounted', () => {
		const toolbar = source('components/shared/FilterToolbarReadout.tsx');

		expect(toolbar).toContain('disabled={hasFilters !== true}');
		expect(toolbar).not.toContain('title="Reset filters"');
	});

	test('no toolbar keeps its own conditional readout', () => {
		const offenders = TOOLBARS.filter((file) => /hasFilters \?/.test(source(file)));

		expect(offenders).toEqual([]);
	});

	test('the graph stops printing the visible count twice', () => {
		const components = source('pages/projects/detail/dependencyGraphComponents.tsx');

		expect(components).not.toContain('visible</Badge>');
		expect(components).not.toContain('visibleCount');
	});
});

describe('the width belongs to the container', () => {
	test('the shared select class declares no width at all', () => {
		const styles = source('lib/formStyles.ts');
		const start = styles.indexOf('export const selectClass');
		const selectDeclaration = styles.slice(start, styles.indexOf('\n', start));

		// `cn()` merges within a property group, and `w-full` and `min-w-36` are different groups —
		// so a select that asked for a minimum width silently kept a `width: 100%` it never wrote.
		// With `flex-basis: auto` that width wins, and the Runs toolbar's four controls each took a
		// row of their own.
		expect(selectDeclaration).not.toContain('w-full');
		expect(styles).toContain('const controlChromeClass');
	});

	test('the input keeps its width, because a 20-character default is never right', () => {
		const styles = source('lib/formStyles.ts');

		expect(styles).toContain('export const formControlClass = `w-full ${controlChromeClass}`');
	});

	test('no select pairs an uncapped w-full with a min-width', async () => {
		// A `w-full` next to a `min-w-*` is the shape that broke the Runs toolbar. It is safe when
		// something bounds it — `flex-1`/`flex-[2]` zero the basis so the width never applies on the
		// main axis, and a `max-w-*` caps it — and a hazard when nothing does.
		const exemptions: { file: string; why: string }[] = [
			{
				file: 'pages/projects/profileMatrix/ProfileMatrixRow.tsx',
				why: 'a facet dropdown in a matrix cell: the column is the width, and a select sized to its longest option would make the grid ragged',
			},
		];
		const exempt = new Set(exemptions.map((entry) => entry.file));
		const glob = new Bun.Glob('**/*.tsx');
		const offenders: string[] = [];

		for await (const file of glob.scan({ cwd: SRC_ROOT, onlyFiles: true })) {
			const path = file.replaceAll('\\', '/');
			if (exempt.has(path)) continue;
			const text = readFileSync(join(SRC_ROOT, file), 'utf8');
			for (const [index, line] of text.split('\n').entries()) {
				if (!line.includes('selectClass') || !line.includes('w-full')) continue;
				const bounded = /\bflex-(?:1|\[)/.test(line) || /\bmax-w-/.test(line);
				if (/min-w-\S+/.test(line) && !bounded) offenders.push(`${path}:${index + 1}`);
			}
		}

		expect(offenders).toEqual([]);
	});
});

describe('a checkbox owns its box, its label and its description', () => {
	const SETTINGS = [
		'pages/settings/DirectAiSection.tsx',
		'pages/settings/DirectorAutoCycleSection.tsx',
		'pages/settings/GeneralDefaultsSection.tsx',
		'pages/settings/NetworkAccessSection.tsx',
		'pages/settings/ObservabilitySection.tsx',
		'pages/settings/RunLimitsSection.tsx',
		'pages/settings/SpernakitScaffoldingSection.tsx',
	];

	test('Field gains the variant and it renders one bordered row', () => {
		const field = source('components/ui/field.tsx');

		expect(field).toContain('export function FieldCheckbox(');
		expect(field).toContain('rounded-md border px-3 py-2');
		expect(field).toContain("description ? 'items-start' : 'min-h-9 items-center'");
	});

	test('no settings section rebuilds the row by hand', () => {
		const offenders = SETTINGS.filter((file) => source(file).includes('<Checkbox'));

		expect(offenders).toEqual([]);
	});

	test('help text has exactly one location: inside the box', () => {
		// The Spernakit toggle put its sentence outside the bordered box as a sibling paragraph,
		// so the box read as a bare switch and the explanation belonged to whatever came next.
		const scaffolding = source('pages/settings/SpernakitScaffoldingSection.tsx');
		const field = source('components/ui/field.tsx');

		expect(scaffolding).toContain('description="The Spernakit template checkout is hidden');
		expect(field).toContain("'mt-1 block text-xs'");
	});

	test('the two toggles that widen what the app may do paint amber', () => {
		expect(source('pages/settings/DirectAiSection.tsx')).toContain('tone="amber"');
		expect(source('pages/settings/NetworkAccessSection.tsx')).toContain(
			"tone={form.allowRemote ? 'amber' : 'neutral'}",
		);
	});
});
