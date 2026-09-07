import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const FRONTEND = resolve(import.meta.dir, '../../frontend');
const SRC = join(FRONTEND, 'src');
const AUDITS = join(SRC, 'pages/audits');
const TABS = join(AUDITS, 'tabs');

function read(...segments: string[]): Promise<string> {
	return Bun.file(join(...segments)).text();
}

function renderMatrixCells(): Record<string, string> {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { EffectCell, MatrixLegend } from './src/pages/audits/tabs/matrixCells.tsx';",
		"const cell = (effect) => renderToStaticMarkup(createElement(EffectCell, { cell: { applies: effect !== 'excluded', effect, source: 'global-rule' } }));",
		"console.log(JSON.stringify({ disabled: cell('disabled'), excluded: cell('excluded'), legend: renderToStaticMarkup(createElement(MatrixLegend)), required: cell('required') }));",
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as Record<string, string>;
}

describe('the catalog table starts on the first screen', () => {
	test('the initial editor follows the visible sorted catalog order', async () => {
		const tab = await read(TABS, 'CatalogTab.tsx');

		expect(tab).toContain('const first = filteredDefinitions[0]?.name;');
		expect(tab).toContain('}, [filteredDefinitions, selectedAudit]);');
	});

	test('the launch-target picker is a disclosure, not a 33-project grid', async () => {
		// Expanded, the picker ran y=440 to y=810 and pushed the first header of the table this tab
		// exists to show to y=830 — five audit rows on a 1200px screen.
		const card = await read(TABS, 'LaunchTargetsCard.tsx');

		expect(card).toContain('aria-expanded={open}');
		expect(card).toContain('aria-controls={PANEL_ID}');
		expect(card).toContain("{open ? 'Hide targets' : 'Choose targets'}");
		expect(card).toContain('max-h-80');
		expect(card).toContain('repeat(auto-fill,minmax(12rem,1fr))');
		expect(card).not.toContain('size="compact"');
		// The grid renders only when open, so the collapsed card is a header and nothing else.
		expect(card).toContain('{open &&');
	});

	test('the tab arrives with it collapsed', async () => {
		const tab = await read(TABS, 'CatalogTab.tsx');

		expect(tab).toContain('useState(false)');
		expect(tab).toContain('open={launchTargetsOpen}');
	});

	test('the picker lives in the card holding the buttons it gates', async () => {
		// Collapsed it was a title, a count badge and one button in a card of its own, stacked
		// under another card holding the four buttons it gates — and the toolbar carried a second
		// "Choose launch targets" button doing the same thing as the one in its header.
		// Comments stripped from the two negatives: each file explains the markup it lost in a
		// comment that quotes it.
		const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
		const tab = await read(TABS, 'CatalogTab.tsx');
		const toolbar = strip(await read(TABS, 'CatalogToolbar.tsx'));
		const picker = strip(await read(TABS, 'LaunchTargetsCard.tsx'));

		expect(tab).toContain('launchTargets={');
		expect(toolbar).toContain('{launchTargets}');
		expect(toolbar).not.toContain('Choose launch targets');
		// The picker brings no card of its own; the actions card is the card. (`<CardHeader` is
		// still expected, which is why this matches the tag boundary rather than the prefix.)
		expect(picker).not.toMatch(/<Card[\s>]/u);
	});
});

describe('the numeric columns read as columns', () => {
	test('the units live in the header, once, instead of in every row', async () => {
		const utils = await read(AUDITS, 'auditsUtils.ts');
		const table = await read(TABS, 'CatalogTable.tsx');
		const cells = await read(TABS, 'catalogCells.tsx');

		expect(utils).toContain("reportsColumnLabel = 'Reports (fresh / stale / missing)'");
		expect(utils).toContain('bucketsColumnLabel = `Buckets (of ${bucketColumns.length})`');
		expect(table).toContain('{reportsColumnLabel}');
		expect(table).toContain('{bucketsColumnLabel}');
		// The row cell renders digits and a separator; the nouns are gone from it entirely.
		expect(cells).not.toMatch(/\}\s*fresh/u);
		expect(cells).not.toMatch(/\}\s*stale/u);
		expect(cells).not.toMatch(/\}\s*missing/u);
	});

	test('every numeric column is right-aligned and tabular', async () => {
		const table = await read(TABS, 'CatalogTable.tsx');

		expect(table).toContain(
			'const numericCell = `${contentSizedColumnClass} px-3 py-3 text-right`',
		);
		expect(table).toContain(
			'const numericHead = `${contentSizedColumnClass} bg-muted px-3 py-3 text-right`',
		);
		// Four numeric columns: score, applicable projects, reports, buckets.
		expect((table.match(/className=\{numericHead\}/g) ?? []).length).toBe(4);
	});

	test('report emphasis follows values instead of column position', async () => {
		const cells = await read(TABS, 'catalogCells.tsx');

		expect(cells).not.toContain('toneText.emerald');
		expect(cells).toContain('definition.staleReportCount > 0');
		expect(cells).toContain('definition.missingReportCount > definition.freshReportCount');
	});

	test('the change score is a column rather than a suffix to a variable-width badge', async () => {
		// `tabular-nums` lines digits up with each other; it cannot line a column up when the cell
		// starts at a different x on every row because the badge before it has a different width.
		const table = await read(TABS, 'CatalogTable.tsx');
		const heads = table.slice(table.indexOf('<thead'), table.indexOf('</thead>'));

		expect(heads).toContain('Change Potential');
		expect(heads).toContain('Score');
		expect(heads.indexOf('Change Potential')).toBeLessThan(heads.indexOf('Score'));
	});

	test('the audit name is sortable and the matrix link names its destination', async () => {
		const table = await read(TABS, 'CatalogTable.tsx');
		const sort = await read(AUDITS, 'catalogSort.ts');

		expect(table).toContain('label="Audit"');
		expect(table).toContain('sortKey="name"');
		for (const key of ['acceptance', 'buckets', 'cost', 'name', 'projects', 'recurrence']) {
			expect(sort).toContain(`'${key}'`);
		}
		expect(table).toContain('View ${item.name} in the applicability matrix');
		expect(table).toContain('decoration-dotted');
		expect(table).toContain('focus-visible:ring-ring/80');
	});
});

describe('an overridden audit is identifiable without telling two colours apart', () => {
	test('saved and pending rows have distinct shape markers', async () => {
		const list = await read(TABS, 'OverridesList.tsx');

		expect(list).toContain('border-accent/60');
		expect(list).toContain('border-solid font-semibold');
		expect(list).toContain('toneBorder.amber');
		expect(list).toContain('border-dashed font-semibold');
		expect(list).toContain('Pending');
		expect(list).toContain('border-transparent border-solid font-medium');
		// Every row reserves the 2px, so switching an override shifts nothing.
		expect(list).toContain('border-l-2');
		// Comments stripped first: the module's doc comment names the tint it replaced, and a
		// negative that matches its own explanation passes for the wrong reason.
		expect(list.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('bg-accent-muted');
	});

	test('the overridden subset can be isolated on its own', async () => {
		const tab = await read(TABS, 'OverridesTab.tsx');

		expect(tab).toContain('<FilterToolbar');
		expect(tab).toContain('label="State"');
		expect(tab).toContain("{ label: 'Overridden', value: 'overridden' }");
		expect(tab).toContain("stateFilter === 'overridden'");
		expect(tab).toContain("stateFilter === 'default'");
		expect(tab).toContain("stateFilter === 'pending'");
		expect(tab).toContain("{ label: 'Pending', value: 'pending' }");
		expect(tab).toContain('{overriddenCount} overridden');
		expect(tab).not.toContain('Pending (${dirtyAuditNames.size})');
	});

	test('the rules card sizes to its content instead of matching the list', async () => {
		const card = await read(TABS, 'OverridesRulesCard.tsx');

		// The card moved to its own file when the tab took on the commit strip; the measure
		// travelled with it rather than being left behind at the old call site.
		expect(card).toContain('monoEditorMeasureCardClass');
		expect(card).not.toContain('xl:min-h-[34rem]');
	});

	test('the desktop list uses two aligned row columns in one measured scrollport', async () => {
		const list = await read(TABS, 'OverridesList.tsx');

		expect(list).toContain('className="hidden xl:block"');
		expect(list).toContain('grid grid-cols-2');
		expect(list).toContain('className="w-full text-left text-sm"');
		expect(list).toContain('<OverflowScroller');
		expect(list).toContain('xl:max-h-[var(--fill-height)]');
		expect(list).toContain('items-start');
		expect(list).not.toContain('max-h-[calc(100dvh-');
	});

	test('the project is the subject of the surface rather than a resettable filter', async () => {
		const tab = await read(TABS, 'OverridesTab.tsx');
		const header = tab.slice(tab.indexOf('header={'), tab.indexOf('noun="audits"'));
		const controls = tab.slice(tab.indexOf('total={definitions.length}'));

		expect(header).toContain('label="Project"');
		expect(header).toContain('{overriddenCount} overridden');
		expect(header).toContain("Overrides updated{' '}");
		expect(header).toContain('<RelativeAge value={recordedUpdatedAt} />');
		expect(header).not.toContain('Editing effects and rules for ${selectedProjectName}');
		expect(controls).not.toContain('label="Project"');
	});

	test('the save count describes only unsaved changes', async () => {
		const tab = await read(TABS, 'OverridesTab.tsx');

		expect(tab).toContain('const dirtyChangeCount =');
		expect(tab).toContain('countChangedEffects(explicitAudits, overrides.data.audits)');
		// The count travels with the button, which is now in the pinned commit strip: on a phone
		// the number saying how much was staged used to scroll away with the Save itself.
		expect(tab).toContain('dirtyLabel={');
		expect(tab).toContain('unsaved ');
		expect(tab).not.toContain('` (${overriddenCount})`');
	});
});

describe('the applicability matrix can be searched', () => {
	test('non-default effects have redundant visual treatments in cells and the legend', () => {
		const { disabled = '', excluded = '', legend = '', required = '' } = renderMatrixCells();

		expect(required).toContain('bg-teal-50');
		expect(required).toContain('bg-teal-500');
		expect(disabled).toContain('bg-muted');
		expect(disabled).toContain('text-muted-foreground');
		expect(excluded).toContain('bg-transparent');
		expect(excluded).toContain('ring-2');
		expect(excluded).toContain('ring-control-border');
		for (const effect of ['required', 'disabled', 'excluded']) {
			expect(legend).toContain(`>${effect}<`);
		}
		expect(legend).toContain('bg-teal-500');
		expect(legend).toContain('bg-transparent');
	});

	test('cell provenance is reachable across the whole cell on hover and focus', async () => {
		const cells = await read(TABS, 'matrixCells.tsx');
		const tab = await read(TABS, 'ApplicabilityTab.tsx');

		expect(cells).toContain('<Tooltip content={<CellProvenance cell={cell} />}>');
		expect(cells).toContain('className="font-mono">{cell.source}');
		expect(cells).toContain('className="font-mono wrap-anywhere">{cell.ruleId}');
		expect(cells).toContain('min-h-11 w-full cursor-help');
		expect(cells).toContain('max-sm:ring-1 max-sm:ring-inset');
		expect(cells).toContain('tabIndex={tabIndex}');
		expect(tab).toContain('role="grid"');
		expect(tab).toContain('resolveMatrixCellFocus');
		expect(tab).toContain('for its source and rule id.');
		expect(tab).toContain('[&>span]:w-full');
	});

	test('the tab carries the shared search affordance', async () => {
		const tab = await read(TABS, 'ApplicabilityTab.tsx');

		expect(tab).toContain('<FilterToolbar');
		expect(tab).toContain('<FilterSearch');
		expect(tab).toContain('visibleRows');
		expect(tab).toContain('No audits match that search.');
		expect(tab).toContain("bucketLabels } from '../../projects/projects-list-shared.ts'");
	});

	test('the capped card is the only scroll region on the tab', async () => {
		const tab = await read(TABS, 'ApplicabilityTab.tsx');
		const caps = tab.match(/max-h-\[calc\(100dvh-\d+rem\)\]/g) ?? [];

		expect(caps).toEqual([]);
		expect(tab).toContain('scrollerClassName={viewportFillScrollerClass}');
		// The intro prose is inside the toolbar's header rather than a block of its own — one fewer
		// band of permanent chrome above a region already short of vertical room.
		expect(tab).not.toContain('<TabIntro');
		expect(tab).toContain('Cells show the strictest effect');
		expect(tab.indexOf('Cells show the strictest effect')).toBeGreaterThan(
			tab.indexOf('<FilterToolbar'),
		);
		expect(tab).toContain('table-fixed');
		expect(tab).toContain('<colgroup>');
	});

	test('the toolbar header does not restate the tab name', async () => {
		// The selected tab trigger two rows above already reads "Applicability". Titling the
		// card with the tab's own name restated it verbatim and emitted a second `h2` carrying
		// the trigger's accessible name. The Catalog tab gives its toolbar no header at all, so
		// of the three tabs on this page two were titled with their own tab name and one was not.
		const applicability = await read(TABS, 'ApplicabilityTab.tsx');
		const overrides = await read(TABS, 'OverridesTab.tsx');

		expect(applicability).not.toContain('Bucket Applicability');
		expect(overrides).not.toContain(String.raw`title="Project Overrides"`);
	});

	test('the legend belongs to the card, not to a second header row', async () => {
		// As a `<th colSpan={8} scope="colgroup">` it shared the `bg-muted` strip and the border
		// of the column labels, so it read as a second row of them, and it was announced as a
		// column header for every row beneath it.
		// Comments stripped first: the JSX comment explaining the rejected markup quotes the
		// very attribute this asserts is gone.
		const tab = (await read(TABS, 'ApplicabilityTab.tsx')).replace(/\/\*[\s\S]*?\*\//g, '');

		expect(tab).not.toContain(String.raw`scope="colgroup"`);
		// Each responsive rendering keeps the key beside the content it decodes: inside the desktop
		// table card and immediately above the phone card stack.
		expect((tab.match(/<MatrixLegend \/>/g) ?? []).length).toBe(2);
		expect(tab).toContain('className="flex flex-wrap items-center xl:hidden"');
		expect(tab).toMatch(/<Card className="hidden p-0 xl:block">[\s\S]*?<MatrixLegend \/>/u);
	});
});
