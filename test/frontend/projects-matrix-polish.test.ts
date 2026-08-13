import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ProjectSummary } from '../../frontend/src/api/types.ts';
import type { ProfileMatrixRowModel } from '../../frontend/src/pages/projects/profileMatrix/profileMatrixTypes.ts';

import {
	filterMatrixRows,
	postureFilterValue,
} from '../../frontend/src/pages/projects/profileMatrix/profileMatrixFilters.ts';
import { resolveProjectsResultsState } from '../../frontend/src/pages/projects/projects-results-state.ts';
import { projectSortOptions } from '../../frontend/src/pages/projects/projects-table-columns.ts';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(relativePath: string): Promise<string> {
	return readFile(join(frontendSource, ...relativePath.split('/')), 'utf8');
}

// A comment that explains why a class or a control was removed names it, so a test asserting
// absence has to read the code without the prose about it.
function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

function renderProjectsResultsStates(): Record<
	'loading' | 'noDiscovered' | 'noMatch' | 'noRegistered' | 'ready',
	string
> {
	const script = String.raw`
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectsResults } from './src/pages/projects/ProjectsResults.tsx';

const common = {
	gitStatus: undefined,
	onRefresh: () => {},
	onResetFilters: () => {},
	onToggleSort: () => {},
	projectView: 'cards',
	sortDir: 'asc',
	sortKey: 'name',
};

function render(state) {
	const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
	return renderToStaticMarkup(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(ProjectsResults, { ...common, state }),
		),
	);
}

console.log(JSON.stringify({
	loading: render({ type: 'loading' }),
	noDiscovered: render({ type: 'no_discovered' }),
	noMatch: render({ allProjectsCount: 3, type: 'no_match' }),
	noRegistered: render({ type: 'no_registered' }),
	ready: render({ projects: [], type: 'ready' }),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: join(import.meta.dir, '..', '..', 'frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(new TextDecoder().decode(result.stderr));
	}
	return JSON.parse(new TextDecoder().decode(result.stdout)) as Record<
		'loading' | 'noDiscovered' | 'noMatch' | 'noRegistered' | 'ready',
		string
	>;
}

function makeRow(overrides: {
	dirty?: boolean;
	fullHardening?: boolean;
	lowExposure?: boolean;
	name?: string;
	source?: 'explicit' | 'inferred';
}): ProfileMatrixRowModel {
	const name = overrides.name ?? 'alpha';
	return {
		dirty: overrides.dirty ?? false,
		form: {} as ProfileMatrixRowModel['form'],
		posture: {
			fullHardening: overrides.fullHardening ?? false,
			label: 'Standard',
			lowExposure: overrides.lowExposure ?? false,
			reasons: [],
		} as unknown as ProfileMatrixRowModel['posture'],
		preview: null,
		project: {
			metadata: { profile: { source: overrides.source ?? 'explicit' } },
			name,
			path: `/projects/${name}`,
		},
		saving: false,
	} as unknown as ProfileMatrixRowModel;
}

describe('row height is stable across the first edit', () => {
	test('the Unsaved badge occupies its slot whether or not the row is dirty', async () => {
		const source = await read('pages/projects/profileMatrix/ProfileMatrixRow.tsx');

		// Mounted unconditionally and hidden with `invisible`, which keeps the box in flow. A
		// `row.dirty ? <Badge/> : null` would reflow the cell on the first keystroke.
		expect(source).toContain("className={row.dirty ? '' : 'invisible'}");
		expect(source).toContain("aria-hidden={row.dirty ? undefined : 'true'}");
		expect(source).toContain('<div className="flex gap-1.5 whitespace-nowrap">');
	});

	test('the facet selects take their width from the column, not their own content', async () => {
		const source = await read('pages/projects/profileMatrix/ProfileMatrixRow.tsx');
		expect(source).toContain('${selectClass} h-8 w-full px-2 text-xs');
	});
});

describe('the dirty treatment comes from the tone tokens', () => {
	test('the row tint and rule are toneSurface/toneBorder, not a literal amber class', async () => {
		const source = await read('pages/projects/profileMatrix/ProfileMatrixRow.tsx');
		expect(source).toContain("from '../../../lib/tones.ts'");
		expect(source).toContain('row.dirty ? toneSurface.amber');
		expect(source).toContain('border-l-2 ${toneBorder.amber}');
		expect(stripComments(source)).not.toContain('bg-amber-');
	});

	test('the mobile card carries the same rule', async () => {
		const source = await read('pages/projects/profileMatrix/ProfileMatrixMobileList.tsx');
		expect(source).toContain('border-l-2 ${toneBorder.amber}');
	});
});

describe('the resting Summary view renders no disabled control', () => {
	test('the Actions column exists only while editing or while something is unsaved', async () => {
		const table = await read('pages/projects/profileMatrix/ProfileMatrixTable.tsx');
		// Unsaved work alone, not edit mode. A right-pinned column overlays what is beneath it at
		// every scroll position short of the extreme — at scrollLeft 0 the empty 152px Actions
		// column covered 61px of every Release artifacts select — so it may only mount once it has
		// something to hold. Entering edit mode mounts nothing that can be committed yet.
		expect(table).toContain('const showActions = rows.some((row) => row.dirty);');
		expect(table).toContain('showActions ? (');
		expect(table).toContain('showActions={showActions}');
	});

	test('a clean row renders no commit controls at all, in either layout', async () => {
		const row = await read('pages/projects/profileMatrix/ProfileMatrixRow.tsx');
		const mobile = await read('pages/projects/profileMatrix/ProfileMatrixMobileList.tsx');

		// `disabled` is only ever the in-flight save, never "there is nothing to save".
		for (const source of [row, mobile]) {
			expect(source).toContain('disabled={row.saving}');
			expect(source).not.toContain('disabled={!row.dirty');
			expect(source).toContain('row.dirty ? (');
		}
	});
});

describe('both pinned seams are drawn from one token', () => {
	test('the shared classes exist and the offsets face the scrolling side', async () => {
		const styles = await read('lib/tableStyles.ts');

		// A positive x-offset on an inset shadow lays it along the left inner edge: a left-pinned
		// column's seam faces right (negative) and a right-pinned column's faces left (positive).
		expect(styles).toContain(
			"export const pinnedLeftEdgeClass = 'shadow-[inset_-8px_0_8px_-8px_rgba(0,0,0,0.35)]';",
		);
		expect(styles).toContain(
			"export const pinnedRightEdgeClass = 'shadow-[inset_8px_0_8px_-8px_rgba(0,0,0,0.35)]';",
		);
	});

	test('every pinned cell imports the seam instead of spelling one', async () => {
		for (const path of [
			'pages/projects/profileMatrix/ProfileMatrixTable.tsx',
			'pages/projects/profileMatrix/ProfileMatrixRow.tsx',
			'pages/projects/ProjectsTableView.tsx',
		]) {
			const source = await read(path);
			expect(source).toContain('pinnedLeftEdgeClass');
			expect(stripComments(source)).not.toContain('shadow-[inset_');
		}
	});
});

describe('every filter can express every value its column renders', () => {
	test('posture is a three-way, not a boolean wearing three labels', () => {
		expect(postureFilterValue(makeRow({ fullHardening: true }))).toBe('full');
		expect(postureFilterValue(makeRow({ lowExposure: true }))).toBe('low');
		expect(postureFilterValue(makeRow({}))).toBe('standard');
		// Full hardening wins: a project can be both, and that is the stronger statement.
		expect(postureFilterValue(makeRow({ fullHardening: true, lowExposure: true }))).toBe(
			'full',
		);
	});

	test('a low-exposure row is reachable and is not swept up by Standard', () => {
		const rows = [
			makeRow({ fullHardening: true, name: 'hardened' }),
			makeRow({ lowExposure: true, name: 'local' }),
			makeRow({ name: 'plain' }),
		];
		const names = (posture: 'full' | 'low' | 'standard') =>
			filterMatrixRows(rows, {
				dirtyOnly: false,
				posture,
				query: '',
				source: 'all',
			}).map((row) => row.project.name);

		expect(names('low')).toEqual(['local']);
		expect(names('standard')).toEqual(['plain']);
		expect(names('full')).toEqual(['hardened']);
	});

	test('the control offers one option per posture the column renders', async () => {
		const toolbar = await read('pages/projects/profileMatrix/ProfileMatrixToolbar.tsx');
		for (const value of ['standard', 'low', 'full']) {
			expect(toolbar).toContain(`value: '${value}'`);
		}
	});
});

describe('the phone card is the table, not a subset of it', () => {
	const MOBILE = 'pages/projects/profileMatrix/ProfileMatrixMobileList.tsx';
	const ROW = 'pages/projects/profileMatrix/ProfileMatrixRow.tsx';

	test('every column the table has beyond the facets is on the card too', async () => {
		const row = await read(ROW);
		const mobile = await read(MOBILE);

		// Source, Unsaved, Posture with its reason count, Audits, Updated — the five non-facet
		// columns. The card used to stop after the audit counts, so a phone silently lost the
		// hardening triggers and the last-written date, and the operator had no way to know a
		// column existed to be missing.
		for (const value of [
			'sourceLabel(row.project.metadata.profile.source)',
			'unsavedBadgeLabel',
			'row.posture.label',
			'{applicable}/{auditCount} apply',
			'hardeningTriggerLabel(row.posture.reasons.length)',
			'formatUpdatedAt(row.project.metadata.profile.updatedAt)',
		]) {
			expect(row).toContain(value);
			expect(mobile).toContain(value);
		}
	});

	test('the two layouts print those values through one implementation', async () => {
		const labels = await read('pages/projects/profileMatrix/profileMatrixLabels.ts');

		expect(labels).toContain('export function formatUpdatedAt(');
		expect(labels).toContain('export function hardeningTriggerLabel(');
		// A second copy of the formatter is how the two layouts drift back apart.
		for (const path of [ROW, MOBILE]) {
			expect(stripComments(await read(path))).not.toContain('Intl.DateTimeFormat');
		}
	});

	test('the project name is the card heading and owns the full width', async () => {
		const mobile = stripComments(await read(MOBILE));

		// The heading, the path and the badges are one `CardHeader` rather than three stacked
		// blocks the card rolls itself: same information, one wrap row plus the path line, and the
		// h2 comes from the shared component so its rank and size are not this file's opinion.
		expect(mobile).toContain('<CardHeader');
		expect(mobile).toContain('level="subsection"');
		expect(mobile).toMatch(/title=\{[\s\S]*?<Link/);
		expect(mobile).toMatch(/identifier=\{<FilePath/);
		// The badges sat in a `shrink-0` cluster opposite the name, which took a third of a 358px
		// card away from the one line that tells fifteen identical cards apart. CardHeader keeps
		// them inside the `min-w-0 flex-1` column with the title, so they wrap instead of squeezing.
		expect(mobile).not.toContain('justify-between');
		expect(mobile).not.toContain('shrink-0');
	});

	test('the facet form reads as subordinate to the project it edits', async () => {
		const mobile = await read(MOBILE);

		expect(mobile).toContain('Assurance facets');
		expect(mobile).toContain('border-t border-border pt-3');
	});
});

describe('sortable headers are one component', () => {
	test('both tables render the shared header, and neither keeps a local one', async () => {
		const matrix = await read('pages/projects/profileMatrix/ProfileMatrixTable.tsx');
		const projects = await read('pages/projects/ProjectsTableView.tsx');

		for (const source of [matrix, projects]) {
			expect(source).toContain('SortableColumnHeader');
			expect(stripComments(source)).not.toContain('function SortHeader');
			expect(stripComments(source)).not.toContain('ArrowUpDown');
		}
	});

	test('the shared header carries the hover, the cursor and the sort state', async () => {
		const header = await read('components/shared/SortableColumnHeader.tsx');
		expect(header).toContain('cursor-pointer');
		expect(header).toContain('hover:underline');
		expect(header).toContain('aria-sort=');
		expect(header).toContain('aria-label={`Sort by ${label}');
	});
});

describe('project card heights converge', () => {
	test('the milestone run caps at three chips plus a +N badge', async () => {
		const card = await read('pages/projects/ProjectCard.tsx');
		expect(card).toContain('const visibleMilestones = milestoneOrder.slice(0, 3);');
		expect(card).toContain(
			'const hiddenMilestones = milestoneOrder.length - visibleMilestones.length;',
		);
		expect(card).toContain('<Badge tone="neutral">+{hiddenMilestones}</Badge>');
		expect(card).toContain('{hiddenMilestones > 0 ? (');
		expect(stripComments(card)).not.toContain('milestoneOrder.map(');
	});
});

describe('the card attribute list forms a column', () => {
	test('every row sits on one label track instead of starting after its own label', async () => {
		const metrics = await read('pages/projects/ProjectCardMetrics.tsx');
		expect(metrics).toContain('grid grid-cols-[5rem_1fr] items-baseline gap-x-2');
		expect(metrics).toContain('label="Reported cost"');
		expect(metrics).toContain('<MetricRow label="Version">');
		// The old shape put the label inside the value cell as bare text.
		expect(stripComments(metrics)).not.toContain("Version:{' '}");
		expect(stripComments(metrics)).not.toContain("Tokens:{' '}");
	});

	test('the track is narrow enough for the widest value, not just the widest label', async () => {
		const metrics = await read('pages/projects/ProjectCardMetrics.tsx');

		// At 1024 a row gets 157px. 5.5rem left 61px for the value and the `aidd state` badge is
		// `whitespace-nowrap` at 67px for `unknown`, so it spilled 6px out of the card — the value
		// span is `min-w-0`, so the grid never counted the badge as a requirement.
		expect(stripComments(metrics)).not.toContain('grid-cols-[5.5rem_1fr]');
		expect(metrics).toContain('<Badge tone={syncTone(metadata.sync.syncState)}>');
		// The cell stays shrinkable; the track, not the value, is what was over-budget.
		expect(metrics).toContain('<span className="min-w-0">{children}</span>');
	});
});

describe('one primary action on the page', () => {
	test('New Project is primary at rest and says its open state with aria-pressed', async () => {
		const actions = await read('pages/projects/ProjectsPageActions.tsx');
		expect(actions).toContain('aria-pressed={newOpen}');
		expect(actions).toContain('variant="primary"');
		expect(stripComments(actions)).not.toContain("newOpen ? 'primary'");
	});

	test('the card grid launch control is not primary and not a dead button', async () => {
		const launch = await read('components/shared/AppLaunchControl.tsx');
		expect(launch).toContain("variant={crashed || compact ? 'secondary' : 'primary'}");
		// Compact is the list density: unavailable is a label there, not twenty disabled buttons.
		expect(launch).toContain('if (compact) {');
		expect(launch).toContain('inline-flex items-center gap-1.5 text-xs text-muted-foreground');
	});
});

describe('both views can order the same list the same way', () => {
	test('the card sort options are the table columns, one per sortable key', () => {
		expect(projectSortOptions.length).toBeGreaterThan(0);
		expect(projectSortOptions.map((option) => option.key)).toContain('name');
		expect(projectSortOptions.find((option) => option.key === 'passing')?.label).toBe(
			'Features',
		);
		expect(new Set(projectSortOptions.map((option) => option.key)).size).toBe(
			projectSortOptions.length,
		);
	});

	test('the card view renders the control and gets the same handler the headers use', async () => {
		const cardView = await read('pages/projects/ProjectsCardView.tsx');
		const results = await read('pages/projects/ProjectsResults.tsx');
		const control = await read('components/shared/CardSortControl.tsx');

		expect(cardView).toContain('<CardSortControl');
		expect(cardView).toContain('onToggleSort={onToggleSort}');
		expect(results).toContain('<ProjectsCardView');
		expect(results).toMatch(/<ProjectsCardView[\s\S]*?onToggleSort=\{onToggleSort\}/);
		// Same handler as the table headers: a new key selects it, the current key flips direction.
		expect(control).toContain('onToggleSort(event.target.value as Key)');
		expect(control).toContain('onClick={() => onToggleSort(sortKey)}');
	});

	// The control was Projects-only, and the Profile Matrix had the identical hole: 33 cards below
	// `xl` with no way to reorder them. It is shared now, so the third list to need it inherits the
	// affordance instead of reinventing it.
	test('the profile matrix card list sorts through the same shared control', async () => {
		const mobile = await read('pages/projects/profileMatrix/ProfileMatrixMobileList.tsx');
		const page = await read('pages/projects/profileMatrix/ProfileMatrixPage.tsx');

		expect(mobile).toContain('<CardSortControl');
		expect(mobile).toContain('profileMatrixSortOptions');
		// The facet keys are offered exactly when the facet columns exist.
		expect(mobile).toContain('showFacets');
		expect(page).toMatch(/<ProfileMatrixMobileList[\s\S]*?onSort=\{toggleSort\}/);
	});
});

describe('Projects results use one explicit state', () => {
	const readyProjects = [{}] as ProjectSummary[];
	const rendered = renderProjectsResultsStates();
	const resolve = (overrides: Partial<Parameters<typeof resolveProjectsResultsState>[0]> = {}) =>
		resolveProjectsResultsState({
			allProjectsCount: readyProjects.length,
			isError: false,
			isLoading: false,
			skippedRootsCount: 0,
			sorted: readyProjects,
			...overrides,
		});

	test('resolves every mutually exclusive result outcome', () => {
		expect(resolve({ isLoading: true })).toEqual({ type: 'loading' });
		expect(resolve({ allProjectsCount: 0, skippedRootsCount: 1, sorted: [] })).toEqual({
			type: 'no_registered',
		});
		expect(resolve({ allProjectsCount: 0, sorted: [] })).toEqual({
			type: 'no_discovered',
		});
		expect(resolve({ sorted: [] })).toEqual({ allProjectsCount: 1, type: 'no_match' });
		expect(resolve()).toEqual({ projects: readyProjects, type: 'ready' });
	});

	test('keeps the error presentation beside a ready result state', () => {
		expect(resolve({ allProjectsCount: 0, isError: true, sorted: [] })).toEqual({
			projects: [],
			type: 'ready',
		});
	});

	test('renders the named component for each result state', () => {
		expect(rendered.loading).toContain('Loading projects…');
		expect(rendered.loading).toContain('aria-busy="true"');
		expect(rendered.noRegistered).toContain('No registered project roots are reachable.');
		expect(rendered.noRegistered).toContain('Discover Projects');
		expect(rendered.noDiscovered).toContain(
			'No projects discovered under the configured roots.',
		);
		expect(rendered.noDiscovered).toContain('<code>.aidd/</code>');
		expect(rendered.noMatch).toContain('3 projects discovered; clear filters');
		expect(rendered.noMatch).toContain('Clear filters');
		expect(rendered.ready).toContain('Sort by');
		expect(rendered.ready).not.toContain('No projects');
	});

	test('the sole caller passes the discriminated state instead of boolean modes', async () => {
		const page = await read('pages/projects/ProjectsPage.tsx');
		const results = await read('pages/projects/ProjectsResults.tsx');

		expect(page).toContain('const resultsState = resolveProjectsResultsState({');
		expect(page).toMatch(/<ProjectsResults[\s\S]*?state=\{resultsState\}/);
		for (const prop of ['isLoading=', 'noDiscovered=', 'noMatch=', 'noRegistered=']) {
			expect(page).not.toContain(prop);
			expect(results).not.toContain(prop);
		}
		for (const type of ['loading', 'no_registered', 'no_discovered', 'no_match', 'ready']) {
			expect(results).toContain(`case '${type}':`);
		}
	});
});
