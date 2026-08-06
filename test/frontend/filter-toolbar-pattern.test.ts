import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { FILTER_FIELD_ORDER } from '../../frontend/src/lib/filterFields.ts';

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
];

/** The labels a toolbar renders, in the order its JSX declares them. */
function fieldLabels(text: string): string[] {
	const labels: string[] = [];
	// `(?<![-\w])` keeps `aria-label` out: the Applicability tab renders its toolbar above a
	// textarea and a table that each carry one, and they are not filter fields.
	for (const match of text.matchAll(/<Filter(Search|Select)\b|(?<![-\w])label="([^"]+)"/g)) {
		if (match[1] === 'Search') labels.push('Search');
		else if (match[2] !== undefined && labels.length > 0) labels.push(match[2]);
	}
	return labels;
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

describe('one filter toolbar, nine times', () => {
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
			const labels = fieldLabels(source(file));
			if (labels.length === 0) wrong.push(`${file}: no fields found`);
			else if (!isSubsequence(labels, FILTER_FIELD_ORDER))
				wrong.push(`${file}: ${labels.join(' · ')}`);
		}

		expect(wrong).toEqual([]);
	});

	test('every toolbar reaches its multi-column row at the same width', () => {
		// Three toolbars stepped `sm` → `xl` and five went straight to `lg`, so a 1024px window
		// showed some filter rows in one column and others already in four — and `lg` is the worst
		// width to pick, because the nav rail expands at exactly 1024px and takes the gain back.
		// The only two tiers a control row may use are the two-up step and the full row.
		const allowed = /^(?:sm:grid-cols-2|xl:grid-cols-\S+)$/;
		const wrong: string[] = [];

		for (const file of TOOLBARS) {
			const value = /columns="([^"]+)"/.exec(source(file))?.[1];
			if (value === undefined) {
				wrong.push(`${file}: no columns prop`);
				continue;
			}
			const offending = value.split(/\s+/).filter((utility) => !allowed.test(utility));
			if (offending.length > 0) wrong.push(`${file}: ${offending.join(' ')}`);
		}

		expect(wrong).toEqual([]);
	});

	test('the shared component documents the tier it wants copied', () => {
		const toolbar = source('components/shared/FilterToolbar.tsx');

		// The sweep traced the `md:` tier on four surfaces back to this one JSDoc example: the
		// contract a shared component prints is the contract its consumers paste.
		expect(toolbar).toContain('`sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]`');
	});

	test('the two Project Detail tabs that share four filters share their order', () => {
		// Features read Search · Status · Milestone · Source and Dependencies read Search · Status ·
		// Source · Milestone. Two tabs of one page, and switching between them moved the select the
		// operator had just used.
		const features = fieldLabels(source('pages/projects/detail/FeatureFilters.tsx'));
		const graph = fieldLabels(source('pages/projects/detail/DependencyGraphFilters.tsx'));

		expect(features).toEqual(['Search', 'Status', 'Milestone', 'Source']);
		expect(graph).toEqual(features);
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
		const toolbar = source('components/shared/FilterToolbar.tsx');
		const statusIndex = toolbar.indexOf('role="status"');
		const readout = toolbar.slice(statusIndex - 400, statusIndex);

		expect(statusIndex).toBeGreaterThan(-1);
		// A live region announces changes to a region that was already in the DOM. Rendered only
		// when `hasFilters`, it mounts at the same moment its text first appears, which is the one
		// arrangement that reliably says nothing.
		expect(readout).not.toContain('hasFilters ?');
		expect(toolbar).toContain('Showing {filtered} of {total} {noun}');
	});

	test('the reset control is disabled rather than unmounted', () => {
		const toolbar = source('components/shared/FilterToolbar.tsx');

		expect(toolbar).toContain('disabled={!hasFilters}');
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
		const general = source('pages/settings/GeneralDefaultsSection.tsx');
		const field = source('components/ui/field.tsx');

		expect(general).toContain('description="The Spernakit template checkout is hidden');
		expect(field).toContain("'mt-1 block text-xs'");
	});

	test('the two toggles that widen what the app may do paint amber', () => {
		expect(source('pages/settings/DirectAiSection.tsx')).toContain('tone="amber"');
		expect(source('pages/settings/NetworkAccessSection.tsx')).toContain(
			"tone={form.allowRemote ? 'amber' : 'neutral'}",
		);
	});
});
