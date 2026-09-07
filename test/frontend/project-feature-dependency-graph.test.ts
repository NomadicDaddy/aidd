import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { ProjectFeature } from '../../frontend/src/api/types.ts';
import {
	buildFeatureDependencyGraph,
	fitFeatureDependencyGraph,
} from '../../frontend/src/pages/projects/detail/dependencyGraphUtils.ts';
import {
	dependencyGraphViewportFit,
	GRAPH_MIN_READABLE_SCALE,
} from '../../frontend/src/pages/projects/detail/dependencyGraphLayout.ts';
import { dependencyGraphViewportMetrics } from '../../frontend/src/pages/projects/detail/useDependencyGraphViewport.ts';

function feature(input: {
	dependencies?: string[];
	directory: string;
	id?: string;
	status?: string;
	title?: string;
}): ProjectFeature {
	const result: ProjectFeature = {
		directory: input.directory,
		id: input.id ?? input.directory,
		status: input.status ?? 'backlog',
		title: input.title ?? input.directory,
	};
	if (input.dependencies) result.dependencies = input.dependencies;
	return result;
}

function renderFilteredSelectionPanel(): string {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelectedFeaturePanel } from './src/pages/projects/detail/SelectedFeaturePanel.tsx';
import {
	buildFeatureDependencyGraph,
	fitFeatureDependencyGraph,
} from './src/pages/projects/detail/dependencyGraphUtils.ts';

// The prerequisite is complete so the selected node's launch control stays enabled: this case
// is about which relationships survive the filter, and an unsatisfied prerequisite would disable
// the control for an unrelated reason and hide what the case is actually asserting.
const features = [
	{ directory: 'base', id: 'base', passes: true, status: 'completed', title: 'Hidden dependency' },
	{
		dependencies: ['base'],
		directory: 'middle',
		id: 'middle',
		status: 'in_progress',
		title: 'Selected feature',
	},
	{
		dependencies: ['middle'],
		directory: 'top',
		id: 'top',
		status: 'backlog',
		title: 'Visible dependent',
	},
	{
		dependencies: ['top'],
		directory: 'final',
		id: 'final',
		status: 'backlog',
		title: 'Hidden dependent',
	},
];
const graph = buildFeatureDependencyGraph(features);
const visibleGraph = fitFeatureDependencyGraph(graph, new Set(['middle', 'top']));
const nodeByDirectory = new Map(visibleGraph.nodes.map((node) => [node.directory, node]));
const node = nodeByDirectory.get('middle');

console.log(
	renderToStaticMarkup(
		createElement(SelectedFeaturePanel, {
			hasActiveRun: false,
			inventory: features,
			isLaunching: false,
			node,
			nodeByDirectory,
			onClose: () => undefined,
			onLaunchRun: () => undefined,
			onOpenDetails: () => undefined,
			onSelect: () => undefined,
		}),
	),
);
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout).trim();
}

function renderLaunchEligibilityPanels(): Record<string, string> {
	const script = String.raw`
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelectedFeaturePanel } from './src/pages/projects/detail/SelectedFeaturePanel.tsx';
import { buildFeatureDependencyGraph } from './src/pages/projects/detail/dependencyGraphUtils.ts';

const renderPanel = (directory, status, passes, extra = [], dependencies = undefined) => {
	const features = [
		{ dependencies, directory, id: directory, passes, status, title: directory },
		...extra,
	];
	const graph = buildFeatureDependencyGraph(features);
	const node = graph.nodes[0];
	return renderToStaticMarkup(
		createElement(SelectedFeaturePanel, {
			hasActiveRun: false,
			inventory: features,
			isLaunching: false,
			launchTarget: null,
			node,
			nodeByDirectory: new Map([[directory, node]]),
			onClose: () => undefined,
			onLaunchRun: () => undefined,
			onOpenDetails: () => undefined,
			onSelect: () => undefined,
		}),
	);
};

console.log(JSON.stringify({
	backlog: renderPanel('backlog-feature', 'backlog', false),
	blocked: renderPanel(
		'blocked-feature',
		'backlog',
		false,
		[{ directory: 'prerequisite', id: 'prerequisite', passes: false, status: 'backlog', title: 'prerequisite' }],
		['prerequisite'],
	),
	completed: renderPanel('completed-feature', 'completed', true),
	conflict: renderPanel('conflicting-feature', 'in_progress', true),
}));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return JSON.parse(new TextDecoder().decode(result.stdout)) as Record<string, string>;
}

function launchButton(markup: string, directory: string): string {
	const button = markup.match(
		new RegExp(`<button[^>]*aria-label="Launch coding run for ${directory}"[^>]*>`, 'u'),
	)?.[0];
	if (!button) throw new Error(`Launch button not found for ${directory}`);
	return button;
}

describe('project feature dependency graph', () => {
	test('resolves dependencies by directory and id', () => {
		const graph = buildFeatureDependencyGraph([
			feature({ directory: 'foundation', id: 'foundation-feature' }),
			feature({ dependencies: ['foundation-feature'], directory: 'consumer' }),
			feature({ dependencies: ['consumer'], directory: 'dashboard' }),
		]);

		expect(graph.unresolvedDependencies).toEqual([]);
		expect(graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
			['consumer', 'dashboard'],
			['foundation', 'consumer'],
		]);
		expect(graph.nodes.find((node) => node.directory === 'foundation')?.dependents).toEqual([
			'consumer',
		]);
		expect(
			graph.nodes.find((node) => node.directory === 'consumer')?.resolvedDependencies,
		).toEqual(['foundation']);
	});

	test('reports unresolved dependency ids without dropping valid links', () => {
		const graph = buildFeatureDependencyGraph([
			feature({ directory: 'base' }),
			feature({ dependencies: ['base', 'missing-feature'], directory: 'dependent' }),
		]);

		expect(graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
			['base', 'dependent'],
		]);
		expect(graph.unresolvedDependencies).toEqual([
			{ dependencyId: 'missing-feature', featureDirectory: 'dependent' },
		]);
		expect(
			graph.nodes.find((node) => node.directory === 'dependent')?.missingDependencies,
		).toEqual(['missing-feature']);
	});

	test('detects dependency cycles', () => {
		const graph = buildFeatureDependencyGraph([
			feature({ dependencies: ['gamma'], directory: 'alpha' }),
			feature({ dependencies: ['alpha'], directory: 'beta' }),
			feature({ dependencies: ['beta'], directory: 'gamma' }),
		]);

		expect(graph.cycles).toEqual([{ directories: ['alpha', 'beta', 'gamma', 'alpha'] }]);
	});

	test('assigns stable layers and positions from dependencies to dependents', () => {
		const graph = buildFeatureDependencyGraph([
			feature({ dependencies: ['middle'], directory: 'top' }),
			feature({ dependencies: ['base'], directory: 'middle' }),
			feature({ directory: 'base' }),
		]);
		const base = graph.nodes.find((node) => node.directory === 'base');
		const middle = graph.nodes.find((node) => node.directory === 'middle');
		const top = graph.nodes.find((node) => node.directory === 'top');

		expect(base?.layer).toBe(0);
		expect(middle?.layer).toBe(1);
		expect(top?.layer).toBe(2);
		expect(base?.x).toBeLessThan(middle?.x ?? 0);
		expect(middle?.x).toBeLessThan(top?.x ?? 0);
		expect(graph.width).toBeGreaterThan(0);
		expect(graph.height).toBeGreaterThan(0);
	});

	test('refits a filtered result without mutating the full graph', () => {
		const graph = buildFeatureDependencyGraph([
			feature({ directory: 'base' }),
			feature({ dependencies: ['base'], directory: 'middle' }),
			feature({ dependencies: ['middle'], directory: 'top' }),
			feature({ dependencies: ['top'], directory: 'final' }),
		]);
		const fitted = fitFeatureDependencyGraph(graph, new Set(['middle', 'top']));
		const middle = fitted.nodes.find((node) => node.directory === 'middle');
		const top = fitted.nodes.find((node) => node.directory === 'top');

		expect(fitted.nodes.map((node) => node.directory)).toEqual(['middle', 'top']);
		expect(fitted.edges.map((edge) => [edge.source, edge.target])).toEqual([['middle', 'top']]);
		expect(middle?.layer).toBe(0);
		expect(top?.layer).toBe(1);
		expect(middle?.resolvedDependencies).toEqual([]);
		expect(middle?.dependents).toEqual(['top']);
		expect(top?.resolvedDependencies).toEqual(['middle']);
		expect(top?.dependents).toEqual([]);
		expect(fitted.width).toBeLessThan(graph.width);
		expect(graph.nodes).toHaveLength(4);
	});

	test('uses available canvas width to shorten dense semantic layers', () => {
		const graph = buildFeatureDependencyGraph([
			feature({ directory: 'base' }),
			...Array.from({ length: 8 }, (_, index) =>
				feature({ dependencies: ['base'], directory: `dependent-${index}` }),
			),
		]);
		const visible = new Set(graph.nodes.map((node) => node.directory));
		const fitted = fitFeatureDependencyGraph(graph, visible, 1_600);
		const dependentNodes = fitted.nodes.filter((node) =>
			node.directory.startsWith('dependent-'),
		);

		expect(fitted.height).toBeLessThan(graph.height);
		expect(new Set(dependentNodes.map((node) => node.x)).size).toBeGreaterThan(1);
		expect(dependentNodes.every((node) => node.layer === 1)).toBeTrue();
	});

	test('does not insert empty subcolumns when sparse layers already fit', () => {
		const graph = buildFeatureDependencyGraph([
			feature({ directory: 'base' }),
			feature({ dependencies: ['base'], directory: 'dependent' }),
		]);
		const visible = new Set(graph.nodes.map((node) => node.directory));
		const fitted = fitFeatureDependencyGraph(graph, visible, 2_400);

		expect(fitted.nodes.map((node) => node.x)).toEqual(graph.nodes.map((node) => node.x));
		expect(fitted.width).toBe(graph.width);
	});

	test('retains every relationship in a filtered graph larger than one page of nodes', () => {
		const graph = buildFeatureDependencyGraph(
			Array.from({ length: 121 }, (_, index) => {
				const directory = `node-${index.toString().padStart(3, '0')}`;
				return feature({
					...(index === 0
						? {}
						: { dependencies: [`node-${(index - 1).toString().padStart(3, '0')}`] }),
					directory,
				});
			}),
		);
		const visible = fitFeatureDependencyGraph(
			graph,
			new Set(graph.nodes.map((node) => node.directory)),
		);

		expect(visible.nodes).toHaveLength(121);
		expect(visible.edges).toHaveLength(120);
		expect(visible.edges.some((edge) => edge.id.startsWith('node-059->node-060:'))).toBeTrue();
	});

	test('defaults to connection count ordering and preserves alphabetical as a choice', () => {
		const graph = buildFeatureDependencyGraph([
			feature({ directory: 'alpha' }),
			feature({ directory: 'zeta' }),
			feature({ dependencies: ['zeta'], directory: 'zeta-dependent' }),
		]);
		const visible = new Set(graph.nodes.map((node) => node.directory));
		const connections = fitFeatureDependencyGraph(graph, visible);
		const alphabetical = fitFeatureDependencyGraph(graph, visible, undefined, 'alphabetical');

		expect(connections.nodes.find((node) => node.directory === 'zeta')?.y).toBeLessThan(
			connections.nodes.find((node) => node.directory === 'alpha')?.y ?? 0,
		);
		expect(alphabetical.nodes.find((node) => node.directory === 'alpha')?.y).toBeLessThan(
			alphabetical.nodes.find((node) => node.directory === 'zeta')?.y ?? 0,
		);
	});

	test('reports the graph position against each scrollable axis', () => {
		expect(
			dependencyGraphViewportMetrics({
				clientHeight: 320,
				clientWidth: 1_000,
				scrollHeight: 4_320,
				scrollLeft: 0,
				scrollTop: 2_000,
				scrollWidth: 1_000,
			}),
		).toEqual({
			clientHeight: 320,
			clientWidth: 1_000,
			horizontalPercent: 0,
			scrollHeight: 4_320,
			scrollWidth: 1_000,
			verticalPercent: 50,
		});
	});

	test('fits sparse graphs while keeping dense graph labels above the readable floor', () => {
		expect(dependencyGraphViewportFit(1_600, 1_200)).toBe(1);
		expect(dependencyGraphViewportFit(1_600, 1_800)).toBeCloseTo(1_600 / 1_800);
		expect(dependencyGraphViewportFit(1_150, 1_952)).toBe(GRAPH_MIN_READABLE_SCALE);
		expect(14 * dependencyGraphViewportFit(1_150, 1_952)).toBe(11);
	});

	test('uses neutral fitting until the graph viewport has measurable dimensions', () => {
		expect(dependencyGraphViewportFit(undefined, 1_952)).toBe(1);
		expect(dependencyGraphViewportFit(0, 1_952)).toBe(1);
		expect(dependencyGraphViewportFit(1_150, 0)).toBe(1);
	});

	test('renders only relationships retained by the active filters', () => {
		const markup = renderFilteredSelectionPanel();

		expect(markup).toMatch(/Depends on<\/p><p[^>]*>0<\/p>/u);
		expect(markup).toMatch(/Dependents<\/p><p[^>]*>1<\/p>/u);
		expect(markup).toContain('Visible dependent');
		expect(markup).toMatch(/<button[^>]*\bbg-accent\b[^>]*>.*Launch run<\/button>/u);
		expect(markup).not.toContain('Hidden dependency');
		expect(markup).not.toContain('Hidden dependent');
	});

	test('renders launch eligibility consistently for selected dependency nodes', () => {
		const panels = renderLaunchEligibilityPanels();

		expect(launchButton(panels.backlog ?? '', 'backlog-feature')).not.toContain(' disabled=""');
		expect(launchButton(panels.completed ?? '', 'completed-feature')).toContain(' disabled=""');
		expect(launchButton(panels.conflict ?? '', 'conflicting-feature')).toContain(
			' disabled=""',
		);
	});

	test('a node behind an incomplete prerequisite names it instead of only going grey', () => {
		const panels = renderLaunchEligibilityPanels();
		const blocked = panels.blocked ?? '';

		// Selection skips this record, so a run launched from the node would decline to pick it up.
		// The control is disabled for that reason, and the reason is on screen and in the title —
		// a disabled control that will not say what it is waiting on reads as broken.
		expect(launchButton(blocked, 'blocked-feature')).toContain(' disabled=""');
		// A disabled Button moves its title into the tooltip rather than onto the element, so the
		// reason is asserted against the panel markup rather than against the button attributes.
		expect(blocked).toContain('Cannot launch: waiting on prerequisite');
		expect(blocked).toContain('Blocked by');
	});
});
