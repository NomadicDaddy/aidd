import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { countActiveFilters } from '../../frontend/src/lib/filterFields.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');
const SRC_ROOT = join(FRONTEND_ROOT, 'src');

function source(relative: string): string {
	return readFileSync(join(SRC_ROOT, relative), 'utf8');
}

function renderConsumerCounts(): Record<string, string> {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { ProjectsToolbar } from './src/pages/projects/ProjectsToolbar.tsx';",
		"import { FeatureFilters } from './src/pages/projects/detail/FeatureFilters.tsx';",
		"import { DependencyGraphFilters } from './src/pages/projects/detail/DependencyGraphFilters.tsx';",
		"import { buildFeatureDependencyGraph } from './src/pages/projects/detail/dependencyGraphUtils.ts';",
		"import { RunFilters } from './src/pages/runs/RunFilters.tsx';",
		'const noop = () => undefined;',
		'const graph = buildFeatureDependencyGraph([]);',
		'const projects = createElement(ProjectsToolbar, {',
		" allProjectsCount: 4, hasFilters: true, maturityFilter: 'all',",
		" milestoneFilter: 'MVP', milestoneOptions: ['MVP'], onResetFilters: noop,",
		" onUpdateParam: noop, phaseFilter: 'coding', query: '', rootFilter: 'all',",
		" rootOptions: [], sortedCount: 2, syncFilter: 'all',",
		'});',
		'const features = createElement(FeatureFilters, {',
		" filteredTotal: 2, hasFilters: true, milestoneFilter: 'MVP',",
		" milestoneOptions: [{ label: 'MVP', value: 'MVP' }], onFilterChange: noop,",
		" onResetFilters: noop, query: '', sourceFilter: 'audit',",
		" sourceOptions: [{ label: 'Audit', value: 'audit' }], statusFilter: 'completed', total: 8,",
		'});',
		'const dependencies = createElement(DependencyGraphFilters, {',
		" graph, hasFilters: true, milestoneFilter: 'MVP',",
		" milestoneOptions: [{ label: 'MVP', value: 'MVP' }], onMilestoneFilterChange: noop,",
		' onQueryChange: noop, onResetFilters: noop, onResetZoom: noop,',
		' onSourceFilterChange: noop, onStatusFilterChange: noop, onZoomIn: noop, onZoomOut: noop,',
		" query: '', sourceFilter: 'audit', sourceOptions: [{ label: 'Audit', value: 'audit' }],",
		" statusFilter: 'completed', visibleCount: 0, zoom: 1,",
		'});',
		'const runs = createElement(RunFilters, {',
		" filteredCount: 2, historyProject: 'D:/applications/aidd', kindFilter: 'all',",
		" modeFilter: 'audit', onClear: noop, onHistoryProjectChange: noop,",
		' onKindFilterChange: noop, onModeFilterChange: noop, onQueryChange: noop,',
		" onStatusFilterChange: noop, projects: [], query: '', statusFilter: 'failed', totalCount: 8,",
		'});',
		'console.log(JSON.stringify({',
		' dependencies: renderToStaticMarkup(dependencies),',
		' features: renderToStaticMarkup(features),',
		' projects: renderToStaticMarkup(projects),',
		' runs: renderToStaticMarkup(runs),',
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
		const toolbar = source('components/shared/FilterToolbar.tsx');

		expect(toolbar.match(/disabled={!hasFilters} onClick={onReset}/g)).toHaveLength(2);
		expect(toolbar).toContain('Showing {filtered} of {total} {noun}');
	});
});

describe('mobile filter disclosure consumers', () => {
	test('maps each consumer state to its visible active count', () => {
		const markup = renderConsumerCounts();

		expect(markup.projects).toContain('2 active');
		expect(markup.features).toContain('3 active');
		expect(markup.dependencies).toContain('3 active');
		expect(markup.runs).toContain('3 active');
	});

	test('adopts only the four inventory and graph workflows', () => {
		const consumers = [
			'pages/projects/ProjectsToolbar.tsx',
			'pages/projects/detail/FeatureFilters.tsx',
			'pages/projects/detail/DependencyGraphFilters.tsx',
			'pages/runs/RunFilters.tsx',
		];

		for (const consumer of consumers) {
			const text = source(consumer);
			expect(text).toContain('mobileFilters={{');
			expect(text).toContain('countActiveFilters(');
		}
	});
});
