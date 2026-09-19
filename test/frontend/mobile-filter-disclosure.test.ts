import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { countActiveFilters } from '../../frontend/src/lib/filterFields.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const SRC_ROOT = join(FRONTEND_ROOT, 'src');

const FILTER_TOOLBAR_CONSUMERS = [
	'components/shared/local-aidd-history/LocalRunsTable.tsx',
	'pages/audits/tabs/ApplicabilityTab.tsx',
	'pages/audits/tabs/CatalogToolbar.tsx',
	'pages/audits/tabs/OverridesTab.tsx',
	'pages/diary/DiaryFilterBar.tsx',
	'pages/projects/detail/AuditsTab.tsx',
	'pages/projects/detail/DependencyGraphFilters.tsx',
	'pages/projects/detail/FeatureFilters.tsx',
	'pages/projects/detail/InterviewFilters.tsx',
	'pages/projects/detail/ReportsTab.tsx',
	'pages/projects/profileMatrix/ProfileMatrixToolbar.tsx',
	'pages/projects/ProjectIngestFilters.tsx',
	'pages/projects/ProjectsToolbar.tsx',
	'pages/recipes/RecipesFilterToolbar.tsx',
	'pages/runs/RunFilters.tsx',
	'pages/skills/SkillsFilterToolbar.tsx',
	'pages/telemetry/TelemetryFilterToolbar.tsx',
] as const;

function source(relative: string): string {
	return readFileSync(join(SRC_ROOT, relative), 'utf8');
}

function renderConsumerCounts(): Record<string, string> {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { FilterToolbar } from './src/components/shared/FilterToolbar.tsx';",
		"import { ProjectsToolbar } from './src/pages/projects/ProjectsToolbar.tsx';",
		"import { FeatureFilters } from './src/pages/projects/detail/FeatureFilters.tsx';",
		"import { PageRail } from './src/components/shared/PageRail.tsx';",
		"import { DependencyGraphFilters } from './src/pages/projects/detail/DependencyGraphFilters.tsx';",
		"import { buildFeatureDependencyGraph } from './src/pages/projects/detail/dependencyGraphUtils.ts';",
		"import { RunFilters } from './src/pages/runs/RunFilters.tsx';",
		'const noop = () => undefined;',
		'const graph = buildFeatureDependencyGraph([]);',
		"const onRail = (child) => createElement(PageRail, { rail: 'full' }, child);",
		'const projects = createElement(ProjectsToolbar, {',
		" allProjectsCount: 4, hasFilters: true, maturityFilter: 'all',",
		" milestoneFilter: 'MVP', milestoneOptions: ['MVP'], onResetFilters: noop,",
		" onUpdateParam: noop, phaseFilter: 'coding', query: '', rootFilter: 'all',",
		" rootOptions: [], sortedCount: 2, profileFilter: 'all',",
		'});',
		'const features = createElement(FeatureFilters, {',
		" filteredTotal: 2, hasFilters: true, milestoneFilter: 'MVP',",
		" milestoneOptions: [{ label: 'MVP', value: 'MVP' }], onFilterChange: noop,",
		" onResetFilters: noop, priorityFilter: 'all', priorityOptions: [], query: '', sourceFilter: 'audit',",
		" sourceOptions: [{ label: 'Audit', value: 'audit' }], statusFilter: 'completed', total: 8,",
		'});',
		'const dependencies = createElement(DependencyGraphFilters, {',
		" graph, hasFilters: true, milestoneFilter: 'MVP',",
		" milestoneOptions: [{ label: 'MVP', value: 'MVP' }], onMilestoneFilterChange: noop,",
		' onQueryChange: noop, onResetFilters: noop, onResetZoom: noop,',
		' onSourceFilterChange: noop, onStatusFilterChange: noop, onZoomIn: noop, onZoomOut: noop,',
		" query: '', sourceFilter: 'audit', sourceOptions: [{ label: 'Audit', value: 'audit' }],",
		" statusFilter: 'completed', visibleCount: 0, visibleGraph: graph, zoom: 1,",
		'});',
		'const runs = createElement(RunFilters, {',
		" displayedCount: 2, filteredCount: 2, historyProject: 'D:/applications/aidd',",
		" initiatorFilter: 'operator', kindFilter: 'all', modeFilter: 'audit', onClear: noop,",
		' onHistoryProjectChange: noop, onInitiatorFilterChange: noop, onKindFilterChange: noop,',
		' onModeFilterChange: noop, onQueryChange: noop, onStatusFilterChange: noop,',
		" projects: [], query: '', statusFilter: 'failed', totalCount: 8,",
		'});',
		'const defaults = createElement(FilterToolbar, {',
		" columns: '@min-[36rem]:grid-cols-2', filtered: 3, hasFilters: false,",
		" noun: 'items', onReset: noop, total: 8,",
		"}, createElement('input', { placeholder: 'Find items' }),",
		"createElement('select', null, createElement('option', null, 'All states')));",
		'console.log(JSON.stringify({',
		' defaults: renderToStaticMarkup(onRail(defaults)),',
		' dependencies: renderToStaticMarkup(onRail(dependencies)),',
		' features: renderToStaticMarkup(onRail(features)),',
		' projects: renderToStaticMarkup(onRail(projects)),',
		' runs: renderToStaticMarkup(onRail(runs)),',
		'}));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: FRONTEND_ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout).trim()) as Record<string, string>;
}

/** Top-level children of a file's FilterToolbar element, located by indentation. */
function toolbarChildCount(text: string): number {
	const lines = text.split(/\r?\n/u);
	const open = lines.findIndex((line) => line.trim() === '<FilterToolbar');
	if (open === -1) throw new Error('no FilterToolbar element');
	const indent = lines[open]!.length - lines[open]!.trimStart().length;
	const close = lines.findIndex(
		(line, index) => index > open && line.trim() === '</FilterToolbar>',
	);
	if (close === -1) throw new Error('unclosed FilterToolbar element');
	let children = 0;
	for (let index = open + 1; index < close; index += 1) {
		const line = lines[index]!;
		const body = line.trimStart();
		const depth = line.length - body.length;
		// A prop sits at the same depth as a child but never opens with an angle bracket, and a
		// prop's own JSX value is nested one level deeper still. Depth plus opener is enough.
		if (depth === indent + 1 && body.startsWith('<') && !body.startsWith('</')) children += 1;
	}
	return children;
}

/** Every `.tsx` under `frontend/src`, relative to it, with forward slashes. */
function tsxFiles(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const absolute = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...tsxFiles(absolute));
		else if (entry.name.endsWith('.tsx')) {
			found.push(relative(SRC_ROOT, absolute).split(sep).join('/'));
		}
	}
	return found;
}

describe('mobile filter disclosure interaction contract', () => {
	test('counts only active secondary filters', () => {
		expect(countActiveFilters()).toBe(0);
		expect(countActiveFilters(false, true, false, true)).toBe(2);
		expect(countActiveFilters(true, true, true, true, true)).toBe(5);
	});

	test('opens and closes through the canonical focus-restoring dialog', () => {
		const toolbar = source('components/shared/FilterToolbar.tsx');
		const dialog = source('components/ui/dialog.tsx');

		expect(toolbar).toContain('aria-expanded={filtersOpen}');
		expect(toolbar).toContain('onClick={() => setFiltersOpen(true)}');
		expect(toolbar).toContain('onClose={() => setFiltersOpen(false)}');
		expect(toolbar).toContain('onClick={() => setFiltersOpen(false)}');
		expect(dialog).toContain("if (event.key === 'Escape')");
		expect(dialog).toContain('if (trigger && document.contains(trigger)) trigger.focus();');
	});

	test('keeps reset feedback outside and inside the dialog', () => {
		const toolbar = `${source('components/shared/FilterToolbar.tsx')}\n${source(
			'components/shared/FilterToolbarReadout.tsx',
		)}`;

		// Desktop readout, compact trigger row, and dialog each keep a stable reset control.
		expect(toolbar.match(/disabled={!hasFilters}/g)).toHaveLength(2);
		expect(toolbar).toContain('disabled={hasFilters !== true}');
		expect(toolbar.match(/onClick={onReset}/g)).toHaveLength(3);
		expect(toolbar).toContain('{readoutLabel} {filtered} of {total} {noun}');
	});
});

describe('mobile filter disclosure consumers', () => {
	test('maps each consumer state to its visible active count', () => {
		const markup = renderConsumerCounts();

		expect(markup.projects).toContain('2 active secondary filters');
		expect(markup.features).toContain('3 active secondary filters');
		expect(markup.dependencies).toContain('4 active secondary filters');
		// Status, mode, project and now initiator. A filter that exists only on the desktop grid is a
		// filter a phone cannot tell is applied, so the new axis has to reach this count too.
		expect(markup.runs).toContain('4 active secondary filters');
	});

	test('keeps exact active counts for the four inventory and graph workflows', () => {
		const consumers = [
			'pages/projects/ProjectsToolbar.tsx',
			'pages/projects/detail/FeatureFilters.tsx',
			'pages/projects/detail/DependencyGraphFilters.tsx',
			'pages/runs/RunFilters.tsx',
		];

		for (const consumer of consumers) {
			const text = source(consumer);
			expect(text).toContain('activeFilterCount={countActiveFilters(');
			expect(text).toContain('countActiveFilters(');
		}
	});

	test('renders compact disclosure by default at the component boundary', () => {
		const markup = renderConsumerCounts().defaults;

		expect(markup).toContain('aria-haspopup="dialog"');
		expect(markup).toContain('Showing 3 of 8 items');
		expect(markup).toContain('placeholder="Find items"');
		expect(markup).toContain('All states');
	});

	test('every toolbar with secondary controls reports how many are active', () => {
		const omissions: string[] = [];
		const pointless: string[] = [];

		for (const consumer of FILTER_TOOLBAR_CONSUMERS) {
			const text = source(consumer);
			const declares = text.includes('activeFilterCount={countActiveFilters(');
			if (toolbarChildCount(text) > 1) {
				if (!declares) omissions.push(consumer);
			} else if (declares) pointless.push(consumer);
		}

		// Below 36rem a toolbar with secondary controls hides them behind one button, and without
		// a count that button is identical filtered and unfiltered. The count is therefore owed by
		// every such toolbar, not by the ones somebody remembered. A single-control toolbar never
		// collapses, so a count there would be a number nothing renders.
		expect(omissions).toEqual([]);
		expect(pointless).toEqual([]);
	});

	test('the consumer list is every FilterToolbar call site in the app', () => {
		const callSites = tsxFiles(SRC_ROOT).filter((file) => {
			const text = source(file);
			return text.split(/\r?\n/u).some((line) => line.trim() === '<FilterToolbar');
		});

		// The two assertions above are only as complete as this list, so the list is derived and
		// compared rather than trusted. A new toolbar joins the contract by existing.
		expect(callSites.slice().sort()).toEqual([...FILTER_TOOLBAR_CONSUMERS].sort());
	});

	test('keeps every consumer on the toolbar container axis without an opt-in flag', () => {
		const viewportColumns: string[] = [];
		const legacyOptIns: string[] = [];

		for (const consumer of FILTER_TOOLBAR_CONSUMERS) {
			const text = source(consumer);
			const columnsMatch = /columns=(?:"([^"]+)"|{`([^`]+)`})/.exec(text);
			const columns = columnsMatch?.[1] ?? columnsMatch?.[2] ?? '';
			if (/\bmobileFilters=|\bcontentAware/.test(text)) legacyOptIns.push(consumer);
			if (/\b(?:sm|md|lg|xl|2xl):grid-cols-/.test(columns)) viewportColumns.push(consumer);
		}

		expect(legacyOptIns).toEqual([]);
		expect(viewportColumns).toEqual([]);
	});

	test('keeps the project report creation action outside the phone filter disclosure', () => {
		const reports = source('pages/projects/detail/ReportsTab.tsx');
		const trigger = source('components/layout/ProjectReportButton.tsx');

		expect(reports).toContain('className="sm:hidden"');
		expect(reports).toContain('showLabelOnMobile');
		expect(reports).toContain('label="File report"');
		expect(trigger).toContain("showLabelOnMobile ? 'px-3' : 'px-0'");
		expect(trigger).toContain("showLabelOnMobile && !collapsed && 'w-auto justify-start'");
	});
});
