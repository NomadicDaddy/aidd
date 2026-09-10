import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const frontendSource = join(process.cwd(), 'frontend', 'src');

function read(relativePath: string): Promise<string> {
	return Bun.file(join(frontendSource, ...relativePath.split('/'))).text();
}

function stripComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

describe('projects catalog and intake polish', () => {
	test('keeps progress quantitative and reserves warning color for warning copy', async () => {
		const [card, metrics, stack, visuals] = await Promise.all([
			read('pages/projects/ProjectCard.tsx'),
			read('pages/projects/ProjectCardMetrics.tsx'),
			read('pages/projects/ProjectStackDisplay.tsx'),
			read('pages/projects/projects-list-visuals.ts'),
		]);

		expect(visuals).toContain("return 'bg-muted-foreground/60';");
		expect(visuals).not.toContain('return toneSolid.amber');
		expect(visuals).not.toContain('return toneSolid.red');
		expect(card).not.toContain('interactive>');
		expect(card).toContain('const milestoneNames =');
		expect(card).toContain('>Milestones</span>');
		expect(card).toContain('mb-3 min-h-[4.75rem] @min-[32rem]:min-h-12');
		expect(card).toContain('flex flex-1 flex-col gap-2 text-sm text-foreground');
		expect(card).toContain('flex min-w-0 flex-col gap-0.5 text-xs');
		expect(card).toContain('className="min-w-0 break-all"');
		expect(metrics).toContain('grid h-full grid-cols-1 content-between');
		expect(stack).toContain('font-medium text-foreground');
		expect(stack).toContain('disclosureLabel={`${stack.label} stack details`}');
		expect(stack).toContain('disclosure');
		expect(stack).not.toContain('text-background');
		expect(stack).not.toContain('text-white');
	});

	test('aligns list controls and the table on the page rail', async () => {
		const [page, table, toolbar] = await Promise.all([
			read('pages/projects/ProjectsPage.tsx'),
			read('pages/projects/ProjectsTableView.tsx'),
			read('pages/projects/ProjectsToolbar.tsx'),
		]);

		expect(page).toContain('<CardSortControl');
		expect(page).toContain('<ColumnChooser');
		expect(toolbar).toContain('actions={actions}');
		expect(toolbar).toContain("import { formGridMeasureClass } from '../../lib/formStyles.ts'");
		expect(toolbar).toContain('${formGridMeasureClass}');
		// One edge for both views, taken from the catalog rail. Table view used to wrap the same
		// composition in `tableColumnClass`, whose 80rem ceiling falls below the content column
		// from about 1568px of viewport up — the optional columns went on scrolling inside a
		// 1280px box while the rest of the screen sat empty beside it. Neither view may restate a
		// measure here: the toolbar and the results keep taking their width from the page, and
		// optional columns still cannot resize either piece of chrome.
		expect(page).toContain('rail={pageRail}');
		expect(page).toContain('<div className="page-reveal space-y-5">');
		expect(page).not.toContain("from '../../lib/tableStyles.ts'");
		expect(toolbar).not.toContain('rail={rail}');
		expect(table).toContain('<div ref={tableRef}>');
		expect(table).not.toContain('contentRailClass');
		expect(table).toContain('<Card className="p-0">');
		expect(table).not.toContain('tableMeasureClass');
		expect(table).not.toContain('tableColumnClass');
		expect(toolbar).not.toContain('tableColumnClass');
		expect(table).not.toContain('useDefaultMeasure');
		expect(table).not.toContain('<ColumnChooser');
	});

	test('aligns card sorting and preserves table identity while scrolling', async () => {
		const [control, row, table] = await Promise.all([
			read('components/shared/CardSortControl.tsx'),
			read('pages/projects/ProjectTableRow.tsx'),
			read('pages/projects/ProjectsTableView.tsx'),
		]);

		expect(control).toContain('fieldLabelClass');
		expect(control).toContain('${selectClass} max-sm:col-span-2 max-sm:w-full');
		expect(control).not.toContain('size="compact"');
		expect(row).toContain('pinnedLeftEdgeClass');
		expect(row).toContain('empty="placeholder"');
		expect(table).toContain('[--projects-table-cue-inset:0px]');
		expect(table).toContain('sm:[--projects-table-cue-inset:44ch]');
		expect(table).toContain('startCueInset="var(--projects-table-cue-inset)"');
	});

	test('uses shared field and tab primitives throughout project creation', async () => {
		const [actions, blueprint, panel, sourceFields, spec] = await Promise.all([
			read('pages/projects/ProjectCreateActions.tsx'),
			read('pages/projects/BlueprintOnlyToggle.tsx'),
			read('pages/projects/ProjectIntakePanel.tsx'),
			read('pages/projects/ProjectCreateSourceFields.tsx'),
			read('pages/projects/ProjectSpecField.tsx'),
		]);

		expect(panel).toContain('<TabList<IntakeLane>');
		expect(panel).toContain('<TabPanel activeTab={lane}');
		expect(panel).not.toContain('contentRailClass');
		expect(blueprint).toContain('<FieldCheckbox');
		expect(spec).toContain('<FieldRow group hint={hint} label="Spec">');
		expect(sourceFields).toContain('error={source.urlError}');
		expect(sourceFields).toContain('hint="Cloned as a template:');
		expect(actions).toContain('label="Launch"');
		expect(actions).toContain('size="default"');
	});

	test('makes candidate selection explicit, bulk-operable, and narrowly named', async () => {
		const [lane, row] = await Promise.all([
			read('pages/projects/ProjectIngestLane.tsx'),
			read('pages/projects/IngestCandidateRow.tsx'),
		]);
		const renderedRow = stripComments(row);

		expect(lane).toContain('indeterminate={someFilteredSelected}');
		expect(lane).toContain('Select all filtered');
		expect(lane).toContain('Clear selection');
		expect(lane).toContain('total={allCandidates.length}');
		expect(lane).toContain('{importableCount} importable');
		expect(lane).toContain('{selectedIds.size} selected');
		expect(renderedRow).not.toContain('<label className="flex gap-2 p-2 text-sm">');
		expect(renderedRow).toContain('htmlFor={checkboxId}');
		expect(renderedRow).toContain("selected && 'border-accent/50 bg-accent-muted'");
		expect(renderedRow).toContain('labels.map((label) =>');
		expect(renderedRow).not.toContain('Root: {candidate.root}');
	});
});
