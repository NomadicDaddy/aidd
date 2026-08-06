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
const pairedTables: { stack: string; table: string; tier: 'lg' | 'xl' }[] = [
	{
		stack: 'pages/audits/tabs/ApplicabilityTab.tsx',
		table: 'pages/audits/tabs/ApplicabilityTab.tsx',
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
		stack: 'pages/projects/detail/ActiveRunsPanel.tsx',
		table: 'pages/projects/detail/ActiveRunsPanel.tsx',
		tier: 'xl',
	},
	{
		stack: 'pages/projects/detail/AuditsMobileList.tsx',
		table: 'pages/projects/detail/AuditsDesktopTable.tsx',
		tier: 'xl',
	},
	{
		stack: 'pages/projects/detail/FeaturesTab.tsx',
		table: 'pages/projects/detail/FeaturesDesktopTable.tsx',
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
		stack: 'pages/runs/UnifiedExecutionTable.tsx',
		table: 'pages/runs/UnifiedExecutionTable.tsx',
		tier: 'xl',
	},
	{
		stack: 'pages/settings/BackendDefaultsTable.tsx',
		table: 'pages/settings/BackendDefaultsTable.tsx',
		tier: 'xl',
	},
	{
		stack: 'pages/settings/SystemMetricsSection.tsx',
		table: 'pages/settings/SystemMetricsSection.tsx',
		tier: 'lg',
	},
	{
		stack: 'pages/telemetry/InvocationsTable.tsx',
		table: 'pages/telemetry/InvocationsTable.tsx',
		tier: 'xl',
	},
];

/**
 * Contained, but with no card stack. Two different claims live here and the `why` says which:
 * a table narrow enough that there is nothing to replace it with, or a wide one whose stack is
 * filed and not yet built. The second kind is a debt this list makes visible rather than a rule
 * it excuses — a silent exemption is how the first round of this went wrong.
 */
const unpairedTables: { file: string; why: string }[] = [
	{ file: 'pages/audits/tabs/OverridesList.tsx', why: 'two columns; fits the 358px column' },
	{ file: 'pages/projects/ProjectsTableView.tsx', why: 'three columns; fits the 358px column' },
	// Filed as remediation-20260806-table-stacks-remainder. Each needs a designed mobile rendering,
	// and the 2026-08-06 sweep produced no evidence for any of them — inventing six card layouts
	// from no observation is how a remediation becomes its own finding next time.
	{ file: 'components/shared/local-aidd-history/LocalIterationsTable.tsx', why: 'stack filed' },
	{ file: 'components/shared/local-aidd-history/LocalRunsTable.tsx', why: 'stack filed' },
	{ file: 'pages/dashboard/FeatureSummaryCard.tsx', why: 'min-w-[700px]; stack filed' },
	{ file: 'pages/projects/detail/MilestonesTable.tsx', why: 'six columns; stack filed' },
	{ file: 'pages/projects/detail/ProjectUsagePanel.tsx', why: 'ten columns; stack filed' },
	{ file: 'pages/recipes/RecipeGrid.tsx', why: 'nine columns; stack filed' },
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
// that actually scrolls; ApplicabilityTab and AuditsDesktopTable both document that choice.
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
