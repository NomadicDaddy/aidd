import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'frontend', 'src');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(srcRoot, ...segments)).text();
}

function readPath(path: string): Promise<string> {
	return Bun.file(join(srcRoot, ...path.split('/'))).text();
}

/**
 * The house pattern is BOTH halves: a wide table inside a gated scrollport, and a sibling at the
 * same tier presenting the same rows as cards. Asserting one half is what let `InvocationsTable`
 * pass a review while rendering 812px of table into a 324px scrollport.
 *
 * The tier is per-table rather than always `xl`, because "where does this table stop fitting" is a
 * property of the table. An expanded rail leaves 736px of content at `lg` and 992px at `xl`, so a
 * 640px table that gates at `xl` shows cards through the whole 1024-1279 range where the table fits
 * — which is the same defect in the other direction. What the guard requires is that both halves
 * name the SAME tier; a pair that disagrees leaves a width showing both renderings or neither.
 */
// The tier is the class prefix, not a fixed tier name: a table may gate on a viewport tier (`lg`,
// `xl`) or on the width of the region it sits in (`@min-[45rem]`). Both are legitimate answers to
// "where does this table stop fitting"; the pairing rule below is the same either way.
const pairedTables: { stack: string; table: string; tier: string }[] = [
	{
		stack: 'pages/audits/tabs/ApplicabilityTab.tsx',
		table: 'pages/audits/tabs/ApplicabilityTab.tsx',
		tier: 'xl',
	},
	{
		stack: 'components/shared/local-aidd-history/LocalIterationsTable.tsx',
		table: 'components/shared/local-aidd-history/LocalIterationsTable.tsx',
		tier: 'xl',
	},
	{
		stack: 'components/shared/local-aidd-history/LocalRunCards.tsx',
		table: 'components/shared/local-aidd-history/LocalRunsTable.tsx',
		tier: 'xl',
	},
	{
		stack: 'pages/audits/tabs/CatalogCards.tsx',
		table: 'pages/audits/tabs/CatalogTable.tsx',
		tier: 'xl',
	},
	{
		stack: 'pages/dashboard/FeatureStatusRows.tsx',
		table: 'pages/dashboard/FeatureStatusRows.tsx',
		tier: 'lg',
	},
	{
		stack: 'pages/dashboard/FeatureSummaryRows.tsx',
		table: 'pages/dashboard/FeatureSummaryRows.tsx',
		tier: 'lg',
	},
	{
		stack: 'pages/projects/detail/ActiveRunsPanel.tsx',
		table: 'pages/projects/detail/ActiveRunsPanel.tsx',
		tier: 'xl',
	},
	{
		stack: 'pages/projects/detail/AuditsMobileList.tsx',
		table: 'pages/projects/detail/AuditsDesktopTable.tsx',
		tier: '@min-[80rem]',
	},
	{
		stack: 'pages/projects/detail/FeaturesTab.tsx',
		table: 'pages/projects/detail/FeaturesDesktopTable.tsx',
		tier: '@min-[61rem]',
	},
	{
		stack: 'pages/projects/detail/MilestonesTable.tsx',
		table: 'pages/projects/detail/MilestonesTable.tsx',
		tier: 'lg',
	},
	{
		stack: 'pages/projects/detail/ProjectUsagePanel.tsx',
		table: 'pages/projects/detail/ProjectUsagePanel.tsx',
		tier: 'lg',
	},
	{
		stack: 'pages/projects/detail/ReportsMobileList.tsx',
		table: 'pages/projects/detail/ReportsDesktopTable.tsx',
		tier: 'xl',
	},
	{
		stack: 'pages/projects/detail/workingTree/WorkingTreeList.tsx',
		table: 'pages/projects/detail/workingTree/WorkingTreeTable.tsx',
		tier: 'xl',
	},
	{
		stack: 'pages/projects/profileMatrix/ProfileMatrixMobileList.tsx',
		table: 'pages/projects/profileMatrix/ProfileMatrixTable.tsx',
		tier: 'xl',
	},
	{
		stack: 'pages/recipes/RecipeGrid.tsx',
		table: 'pages/recipes/RecipeGrid.tsx',
		tier: 'xl',
	},
	{
		stack: 'pages/runs/UnifiedExecutionTable.tsx',
		table: 'pages/runs/UnifiedExecutionTable.tsx',
		tier: 'xl',
	},
	// Both settings tables gate on the settings column's own width rather than the window's, so
	// their tier is a container-query step. The pairing rule is what this suite enforces and it is
	// indifferent to which of the two the tier is expressed in — only that both halves name the same
	// one, so the table and its stack can never both be visible or both be hidden.
	{
		stack: 'pages/settings/BackendDefaultsTable.tsx',
		table: 'pages/settings/BackendDefaultsTable.tsx',
		tier: '@min-[61rem]',
	},
	{
		stack: 'pages/settings/SystemMetricsSection.tsx',
		table: 'pages/settings/SystemMetricsSection.tsx',
		tier: '@min-[45rem]',
	},
	{
		stack: 'pages/telemetry/InvocationsTable.tsx',
		table: 'pages/telemetry/InvocationsTable.tsx',
		tier: 'xl',
	},
];

/**
 * Contained, but with no card stack — a table narrow enough that there is nothing to replace it
 * with. The list also held six wide tables whose stacks were filed and unbuilt, marked
 * `stack filed`; remediation-20260806-table-stacks-remainder built all six and they are paired
 * above. A `stack filed` entry is a debt this list makes visible rather than a rule it excuses, and
 * the guard below now refuses to let one sit here indefinitely.
 */
const unpairedTables: { file: string; why: string }[] = [
	{ file: 'pages/audits/tabs/OverridesList.tsx', why: 'two columns; fits the 358px column' },
	{ file: 'pages/projects/ProjectsTableView.tsx', why: 'three columns; fits the 358px column' },
];

/** Matches a naive `<table` scan and is not a scrollport at all. */
const exemptTables: { file: string; why: string }[] = [
	{
		file: 'pages/projects/detail/ArtifactViewerDialog.tsx',
		why: 'markdown table renderer, single column of prose',
	},
	{
		file: 'pages/telemetry/TelemetryChartTable.tsx',
		why: 'inside <div className="sr-only"> — a chart text alternative, never painted',
	},
];

// A bounded Card is a legitimate scrollport where `sticky top-0` has to stick against the element
// that actually scrolls; ApplicabilityTab documents that choice.
const containment = /<OverflowScroller|max-h-\[[^\]]+\] overflow-auto/;

describe('wide tables are contained and replaced', () => {
	test('every table in the app is classified', async () => {
		// The guard that was missing. `InvocationsTable` was written after the pattern was
		// established, matched no rule anywhere, and shipped with 60% of itself off-screen. A new
		// table file now has to declare which of the three lists it belongs to before it can pass.
		const classified = new Set([
			...pairedTables.map((entry) => entry.table),
			...unpairedTables.map((entry) => entry.file),
			...exemptTables.map((entry) => entry.file),
		]);
		const glob = new Bun.Glob('**/*.tsx');
		const unclassified: string[] = [];

		for await (const file of glob.scan({ absolute: false, cwd: srcRoot, onlyFiles: true })) {
			const path = file.replaceAll('\\', '/');
			if (classified.has(path)) continue;
			const text = await Bun.file(join(srcRoot, file)).text();
			if (text.includes('<table')) unclassified.push(path);
		}

		expect(unclassified).toEqual([]);
	});

	test('a wide table is contained AND replaced, both halves at one tier', async () => {
		const offenders: string[] = [];

		for (const { stack, table, tier } of pairedTables) {
			const source = await readPath(table);
			const scrollerAt = source.search(containment);
			const tableAt = source.indexOf('<table');
			if (scrollerAt < 0) offenders.push(`${table}: no scrollport`);
			// The table is inside the scrollport, not beside it.
			else if (tableAt < scrollerAt) offenders.push(`${table}: table outside the scrollport`);
			// The gate is anywhere above the table, not specifically on the scroller. Three of these
			// put `hidden xl:block` on the wrapping Card instead, which is the better placement —
			// it takes the card's border and padding out with the table rather than leaving an
			// empty frame around a hidden scrollport. Either is an ancestor; what matters is that
			// something above the table names the tier.
			else if (!source.slice(0, tableAt).includes(`${tier}:block`)) {
				offenders.push(`${table}: table not gated ${tier}:block`);
			}
			const stackSource = stack === table ? source : await readPath(stack);
			if (!stackSource.includes(`${tier}:hidden`)) {
				offenders.push(`${stack}: no ${tier}:hidden stack for ${table}`);
			}
		}

		expect(offenders).toEqual([]);
	});

	test('every table that is not exempt scrolls inside a scrollport', async () => {
		const offenders: string[] = [];

		for (const { file } of unpairedTables) {
			const source = await readPath(file);
			if (!containment.test(source)) offenders.push(`${file}: no scrollport`);
		}

		expect(offenders).toEqual([]);
	});

	test('the project Runs tab reaches its Action column at every width', async () => {
		const panel = await read('pages', 'projects', 'detail', 'ActiveRunsPanel.tsx');

		// The regression this guards: the six-column table sat directly in a Card carrying
		// `overflow-hidden p-0` with no scroller at all, so the Action cell was clipped past the
		// card edge with no scroll to recover it. Not off-screen — unreachable.
		//
		// Both halves reach the Live Console, and the card stack carries every column the table
		// does rather than dropping the ones that did not fit.
		const stack = panel.slice(panel.indexOf('xl:hidden'));
		for (const field of ['Open in Live Console', 'run.mode', 'run.status', 'run.startedAt']) {
			expect(stack).toContain(field);
		}
	});

	test('a placeholder is never a table row only', async () => {
		const panel = await read('pages', 'projects', 'detail', 'ActiveRunsPanel.tsx');

		// Loading, error and empty used to exist solely as a `colSpan={6}` <td>, which a card
		// stack has no equivalent of — the stack would have rendered as nothing at all.
		expect(panel).toContain('const placeholder =');
		expect(panel.slice(panel.indexOf('xl:hidden'))).toContain('{placeholder}');
	});

	test('a filed stack is built, not parked in the unpaired list', async () => {
		// The six that carried this reason are the whole of what the list was deferring. Written as
		// a rule rather than as six deletions: the next table that lands here with a promise
		// attached fails immediately instead of waiting for someone to notice the list grew.
		expect(unpairedTables.filter((entry) => entry.why.includes('stack filed'))).toEqual([]);
	});

	test('the remainder stacks carry every column their table carries', async () => {
		// Field-by-field, because a stack that drops a column is the failure this pairing exists to
		// prevent — and it passes every structural check above while doing it.
		const stacks: { fields: string[]; file: string; start: string }[] = [
			{
				fields: [
					'startedLabel',
					'<RunExecutionTarget',
					'<LocalRunResultBadges',
					'formatDuration(run.durationMs)',
					'run.summary',
				],
				file: 'components/shared/local-aidd-history/LocalRunCards.tsx',
				start: 'export function LocalRunCards',
			},
			{
				fields: ['cardColumns.map', 'Fleet total'],
				file: 'pages/dashboard/FeatureSummaryRows.tsx',
				start: 'function FeatureSummaryCards',
			},
			{
				fields: [
					'milestone.priority',
					'milestone.description',
					'milestoneProgressLabel',
					'<MilestoneRowActions',
				],
				file: 'pages/projects/detail/MilestonesTable.tsx',
				start: 'function MilestonesList',
			},
			{
				fields: ['<RecipeCompactList'],
				file: 'pages/recipes/RecipeGrid.tsx',
				start: 'export function RecipeTable',
			},
		];
		const offenders: string[] = [];

		for (const { fields, file, start } of stacks) {
			const source = await readPath(file);
			// Bounded at the scrollport, not at end of file: three of these declare the stack
			// immediately above the table they replace, so an unbounded slice reads the table's own
			// cells and a stack that dropped a column would still pass.
			const from = source.indexOf(start);
			const scroller = source.indexOf('<OverflowScroller', from);
			const stack = source.slice(from, scroller < 0 ? undefined : scroller);
			for (const field of fields) {
				if (!stack.includes(field)) offenders.push(`${file}: stack drops ${field}`);
			}
		}

		expect(offenders).toEqual([]);
	});

	test('the iterations and usage stacks reuse the cells rather than restating them', async () => {
		// Both tables split their cells into components the stack calls too, so a column can only
		// change in both renderings at once. The alternative — a second copy of the same markup —
		// is how the two recipe launch panels drifted apart.
		const iterations = await read(
			'components',
			'shared',
			'local-aidd-history',
			'LocalIterationsTable.tsx',
		);
		const iterationCards = iterations.slice(
			iterations.indexOf('function IterationCards'),
			iterations.indexOf('<OverflowScroller'),
		);
		for (const cell of ['<IterationStatus', '<IterationTarget', '<IterationFeatures']) {
			expect(iterationCards).toContain(cell);
		}
		expect(iterationCards).toContain('iterationDurationLabel');

		const usage = await read('pages', 'projects', 'detail', 'ProjectUsagePanel.tsx');
		// Once per breakdown: by execution target and by run mode.
		expect(usage.split('<UsageMetricFields').length - 1).toBe(2);
		const fields = usage.slice(usage.indexOf('function UsageMetricFields'));
		for (const metric of ['usage.runCount', 'usage.totalTokens', 'costLabel(usage)']) {
			expect(fields).toContain(metric);
		}
	});

	test('the remainder placeholders live outside the scrollport', async () => {
		// A loading, error or empty state expressed only as a colSpan row renders as nothing at all
		// in a card stack. Both of the six that own a placeholder branch above their scroller, so
		// the message is the same one at every width.
		const runs = await read('components', 'shared', 'local-aidd-history', 'LocalRunsTable.tsx');
		expect(runs).toContain('No runs match the current filters.');
		expect(runs.indexOf('No runs match the current filters.')).toBeLessThan(
			runs.indexOf('<OverflowScroller'),
		);

		// Source order is not render order here — both breakdowns are declared above the panel that
		// uses them — so this reads the panel's own body, where the empty branch and the two
		// breakdowns are the two arms of one ternary.
		const usage = await read('pages', 'projects', 'detail', 'ProjectUsagePanel.tsx');
		const panel = usage.slice(usage.indexOf('export function ProjectUsagePanel'));
		expect(panel).toContain('totals.runCount === 0 ?');
		expect(panel.indexOf('No finalized runs available')).toBeLessThan(
			panel.indexOf('<ExecutionBreakdown'),
		);
	});

	test('the invocations stack carries the columns the table used to drop', async () => {
		const table = await read('pages', 'telemetry', 'InvocationsTable.tsx');

		// Source and Project were hidden below the breakpoint because there was nowhere else to
		// put them. With a stack they come back, and the constant that hid them is gone.
		expect(table).not.toContain('table-cell');
		const stack = table.slice(table.indexOf('function InvocationCard'));
		for (const field of [
			'invocation.source',
			'invocation.projectName',
			'invocation.startedAt',
		]) {
			expect(stack).toContain(field);
		}
		expect(stack).toContain('<InvocationDetails');
	});
});
