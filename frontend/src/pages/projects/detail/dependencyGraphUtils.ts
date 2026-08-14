import type { ProjectFeature } from '../../../api/types.ts';

import { detectCycles, graphSize, positionNodes } from './dependencyGraphLayout.ts';
import {
	type FeatureDependencyEdge,
	type FeatureDependencyGraph,
	type FeatureDependencyNode,
	type FeatureDependencySource,
	GRAPH_PADDING,
	type UnresolvedFeatureDependency,
} from './dependencyGraphTypes.ts';
import { featureDirectory } from './featuresUtils.ts';

export { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH } from './dependencyGraphTypes.ts';

export function featureByDirectory(features: ProjectFeature[]): Map<string, ProjectFeature> {
	return new Map(features.map((feature) => [featureDirectory(feature), feature]));
}
export type {
	FeatureDependencyEdge,
	FeatureDependencyGraph,
	FeatureDependencyNode,
} from './dependencyGraphTypes.ts';

function dependencyList(feature: ProjectFeature): string[] {
	if (!Array.isArray(feature.dependencies)) return [];
	const seen = new Set<string>();
	const dependencies: string[] = [];
	for (const dependency of feature.dependencies) {
		if (typeof dependency !== 'string') continue;
		const normalized = dependency.trim();
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		dependencies.push(normalized);
	}
	return dependencies;
}

function featureSource(feature: ProjectFeature, directory: string): FeatureDependencySource {
	const auditSource = typeof feature.auditSource === 'string' ? feature.auditSource : '';
	if (auditSource || /^audit-[a-z][a-z0-9-]*-\d+-/.test(directory)) return 'audit';
	if (/^remediation(-\d+)?-[a-zA-Z0-9-]+$/.test(directory)) return 'remediation';
	return 'feature';
}

function featureTitle(feature: ProjectFeature, directory: string): string {
	return typeof feature.title === 'string' && feature.title.trim()
		? feature.title.trim()
		: directory;
}

function featureStatus(feature: ProjectFeature): string {
	return typeof feature.status === 'string' && feature.status.trim()
		? feature.status.trim()
		: 'unknown';
}

function featureMilestone(feature: ProjectFeature): null | string {
	return typeof feature.milestone === 'string' && feature.milestone.trim()
		? feature.milestone.trim()
		: null;
}

function featurePassState(feature: ProjectFeature): boolean | null {
	return typeof feature.passes === 'boolean' ? feature.passes : null;
}

function featurePriority(feature: ProjectFeature): null | number | string {
	const priority = feature.priority;
	return typeof priority === 'number' || typeof priority === 'string' ? priority : null;
}

function baseNode(feature: ProjectFeature): FeatureDependencyNode {
	const directory = featureDirectory(feature);
	return {
		dependencies: dependencyList(feature),
		dependents: [],
		directory,
		id: feature.id,
		layer: 0,
		milestone: featureMilestone(feature),
		missingDependencies: [],
		passes: featurePassState(feature),
		priority: featurePriority(feature),
		resolvedDependencies: [],
		row: 0,
		source: featureSource(feature, directory),
		status: featureStatus(feature),
		title: featureTitle(feature, directory),
		x: GRAPH_PADDING,
		y: GRAPH_PADDING,
	};
}

function sortedNodes(features: ProjectFeature[]): FeatureDependencyNode[] {
	return features
		.map(baseNode)
		.sort((left, right) => left.directory.localeCompare(right.directory));
}

function buildFeatureLookup(nodes: FeatureDependencyNode[]): Map<string, string> {
	const lookup = new Map<string, string>();
	for (const node of nodes) {
		if (!lookup.has(node.directory)) lookup.set(node.directory, node.directory);
		if (!lookup.has(node.id)) lookup.set(node.id, node.directory);
	}
	return lookup;
}

export function buildFeatureDependencyGraph(features: ProjectFeature[]): FeatureDependencyGraph {
	const nodes = sortedNodes(features);
	const lookup = buildFeatureLookup(nodes);
	const nodeRecords = new Map(nodes.map((node) => [node.directory, node]));
	const edges: FeatureDependencyEdge[] = [];
	const unresolvedDependencies: UnresolvedFeatureDependency[] = [];
	const outgoing = new Map<string, string[]>();

	for (const node of nodes) {
		for (const dependencyId of node.dependencies) {
			const resolved = lookup.get(dependencyId);
			if (!resolved) {
				node.missingDependencies.push(dependencyId);
				unresolvedDependencies.push({
					dependencyId,
					featureDirectory: node.directory,
				});
				continue;
			}
			node.resolvedDependencies.push(resolved);
			nodeRecords.get(resolved)?.dependents.push(node.directory);
			edges.push({
				dependencyId,
				id: `${resolved}->${node.directory}:${dependencyId}`,
				source: resolved,
				target: node.directory,
			});
			const targets = outgoing.get(resolved) ?? [];
			targets.push(node.directory);
			outgoing.set(resolved, targets);
		}
	}

	for (const node of nodes) {
		node.resolvedDependencies.sort((left, right) => left.localeCompare(right));
		node.missingDependencies.sort((left, right) => left.localeCompare(right));
		node.dependents.sort((left, right) => left.localeCompare(right));
	}
	for (const targets of outgoing.values()) {
		targets.sort((left, right) => left.localeCompare(right));
	}

	const positionedNodes = positionNodes(nodes);
	const size = graphSize(positionedNodes);
	return {
		cycles: detectCycles(positionedNodes, outgoing),
		edges: edges.sort((left, right) => left.id.localeCompare(right.id)),
		height: size.height,
		nodes: positionedNodes,
		unresolvedDependencies: unresolvedDependencies.sort((left, right) => {
			const featureOrder = left.featureDirectory.localeCompare(right.featureDirectory);
			return featureOrder === 0
				? left.dependencyId.localeCompare(right.dependencyId)
				: featureOrder;
		}),
		width: size.width,
	};
}

/**
 * Reposition a filtered graph around the nodes it still renders.
 *
 * Filtering used to hide nodes without changing the full graph's 2,000px-plus shell, leaving a
 * three-node result stranded at its original coordinates. The full relationship data stays on the
 * source graph for diagnostics and the selection panel; this view copy only narrows the links used
 * to assign visible layers and calculate the canvas bounds.
 */
export function fitFeatureDependencyGraph(
	graph: FeatureDependencyGraph,
	visibleDirectories: Set<string>,
): FeatureDependencyGraph {
	const visibleNodes = graph.nodes
		.filter((node) => visibleDirectories.has(node.directory))
		.map((node) => ({
			...node,
			dependents: node.dependents.filter((directory) => visibleDirectories.has(directory)),
			resolvedDependencies: node.resolvedDependencies.filter((directory) =>
				visibleDirectories.has(directory),
			),
		}));
	const positionedNodes = positionNodes(visibleNodes);
	const size = graphSize(positionedNodes);
	return {
		...graph,
		edges: graph.edges.filter(
			(edge) => visibleDirectories.has(edge.source) && visibleDirectories.has(edge.target),
		),
		height: size.height,
		nodes: positionedNodes,
		width: size.width,
	};
}
