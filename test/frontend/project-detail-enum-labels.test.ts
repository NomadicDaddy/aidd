import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { featureSourceDisplayLabel } from '../../frontend/src/pages/projects/detail/shared.ts';

const FRONTEND_ROOT = resolve(import.meta.dir, '../../frontend');

function renderEnumLabels(): Record<string, string> {
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { DependencyGraphFilters } from './src/pages/projects/detail/DependencyGraphFilters.tsx';",
		"import { GraphNodeButton } from './src/pages/projects/detail/dependencyGraphComponents.tsx';",
		"import { PageRail } from './src/components/shared/PageRail.tsx';",
		"import { buildFeatureDependencyGraph } from './src/pages/projects/detail/dependencyGraphUtils.ts';",
		"import { FeatureFilters } from './src/pages/projects/detail/FeatureFilters.tsx';",
		'const noop = () => undefined;',
		"const onRail = (child) => createElement(PageRail, { rail: 'full' }, child);",
		"const sourceOptions = [{ label: 'Audit: CODE_QUALITY', value: 'Audit: CODE_QUALITY' }];",
		'const graph = buildFeatureDependencyGraph([]);',
		'const dependencyFilters = createElement(DependencyGraphFilters, {',
		" graph, hasFilters: false, milestoneFilter: 'all', milestoneOptions: [],",
		' onMilestoneFilterChange: noop, onQueryChange: noop, onResetFilters: noop,',
		' onResetZoom: noop, onSourceFilterChange: noop, onStatusFilterChange: noop,',
		" onZoomIn: noop, onZoomOut: noop, query: '', sourceFilter: 'all', sourceOptions,",
		" statusFilter: 'all', visibleCount: 0, visibleGraph: graph, zoom: 1,",
		'});',
		'const featureFilters = createElement(FeatureFilters, {',
		" filteredTotal: 1, hasFilters: false, milestoneFilter: 'all', milestoneOptions: [],",
		" onFilterChange: noop, onResetFilters: noop, priorityFilter: 'all', priorityOptions: [], query: '', sourceFilter: 'all',",
		" sourceOptions, statusFilter: 'all', total: 1,",
		'});',
		'const node = {',
		" dependencies: [], dependents: [], directory: 'feature-one', id: 'feature-one', layer: 0,",
		' milestone: null, missingDependencies: [], passes: false, priority: 3,',
		" resolvedDependencies: [], row: 0, source: 'feature', status: 'waiting_approval',",
		" title: 'Feature one', x: 0, y: 0,",
		'};',
		'const graphNode = createElement(GraphNodeButton, {',
		' hasError: false, isDimmed: false, isRelated: false, isSelected: false, node, onSelect: noop,',
		'});',
		'console.log(JSON.stringify({',
		' dependencyFilters: renderToStaticMarkup(onRail(dependencyFilters)),',
		' featureFilters: renderToStaticMarkup(onRail(featureFilters)),',
		' graphNode: renderToStaticMarkup(graphNode),',
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

describe('Project Detail enum labels', () => {
	test('humanizes audit sources without changing non-audit labels', () => {
		expect(featureSourceDisplayLabel('Audit: CODE_QUALITY')).toBe('Audit: Code quality');
		expect(featureSourceDisplayLabel('Feature: UI')).toBe('Feature: UI');
		expect(featureSourceDisplayLabel('Feature: runs')).toBe('Feature: Runs');
		expect(featureSourceDisplayLabel('Remediation')).toBe('Remediation');
	});

	test('keeps raw filter values behind human-readable labels', () => {
		const markup = renderEnumLabels();

		for (const filter of [markup.dependencyFilters, markup.featureFilters]) {
			expect(filter).toContain('value="waiting_approval">Waiting approval</option>');
			expect(filter).toContain('value="Audit: CODE_QUALITY">Audit: Code quality</option>');
			expect(filter).not.toContain('>waiting_approval</option>');
		}
		expect(markup.graphNode).toContain('Waiting approval');
		expect(markup.graphNode).not.toContain('waiting_approval');
	});
});
