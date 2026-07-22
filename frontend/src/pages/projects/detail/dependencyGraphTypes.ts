export const GRAPH_COLUMN_GAP = 96;
export const GRAPH_NODE_HEIGHT = 82;
export const GRAPH_NODE_WIDTH = 228;
export const GRAPH_PADDING = 28;
export const GRAPH_ROW_GAP = 36;

export type FeatureDependencySource = 'audit' | 'feature' | 'remediation';

export interface FeatureDependencyEdge {
	dependencyId: string;
	id: string;
	source: string;
	target: string;
}

export interface FeatureDependencyCycle {
	directories: string[];
}

export interface UnresolvedFeatureDependency {
	dependencyId: string;
	featureDirectory: string;
}

export interface FeatureDependencyNode {
	dependencies: string[];
	dependents: string[];
	directory: string;
	id: string;
	layer: number;
	milestone: null | string;
	missingDependencies: string[];
	passes: boolean | null;
	priority: null | number | string;
	resolvedDependencies: string[];
	row: number;
	source: FeatureDependencySource;
	status: string;
	title: string;
	x: number;
	y: number;
}

export interface FeatureDependencyGraph {
	cycles: FeatureDependencyCycle[];
	edges: FeatureDependencyEdge[];
	height: number;
	nodes: FeatureDependencyNode[];
	unresolvedDependencies: UnresolvedFeatureDependency[];
	width: number;
}
