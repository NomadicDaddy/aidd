import { describe, expect, test } from 'bun:test';
import type { ProjectFeature } from '../../frontend/src/api/types.ts';
import {
	buildFeatureDependencyGraph,
	fitFeatureDependencyGraph,
} from '../../frontend/src/pages/projects/detail/dependencyGraphUtils.ts';

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
		expect(fitted.width).toBeLessThan(graph.width);
		expect(graph.nodes).toHaveLength(4);
	});
});
