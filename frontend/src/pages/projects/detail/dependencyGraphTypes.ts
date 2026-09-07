/**
 * Half of what it was, with the other half handed to the node.
 *
 * The column pitch — gap plus node width — is unchanged at 324, so the canvas is the same size and
 * the same number of columns fits the pane. What changed is the split: at 96 the gutters were about
 * 30% of the horizontal space while every multi-word title ellipsised in every column
 * (`Audit Measurement Instrum…`, `Backend Adapter Smoke Ma…`), and widening the viewport added
 * columns but never a character of title. 48 is still more than `edgePath`'s 56px minimum bend
 * consumes, so adjacent-layer edges draw exactly as they did.
 */
export const GRAPH_COLUMN_GAP = 48;
/**
 * Tall enough for what a node draws, arrived at by adding it up rather than by eye.
 *
 * The content is 96, so anything shorter (82, say) slices every node's id horizontally through
 * the glyphs — and the id is the only thing that identifies a node. The stack, with
 * `box-sizing: border-box` so the border counts: 12 + 12 padding (`p-3`), 24 badge row (`py-1` +
 * a 16px `text-xs` line), 8 (`mt-2`), 20 title (`text-sm`), 4 (`mt-1`), 16 id (`text-xs`), and
 * 1 + 1 for the top and bottom border. `test/frontend/dependency-graph-nodes.test.ts` re-does the
 * arithmetic, so changing the type scale inside a node fails there rather than in a screenshot.
 */
export const GRAPH_NODE_HEIGHT = 98;
/** 228 for the node body plus the 48px the narrowed `GRAPH_COLUMN_GAP` hands to the title. */
export const GRAPH_NODE_WIDTH = 276;
export const GRAPH_PADDING = 28;
export const GRAPH_ROW_GAP = 36;

export type DependencyGraphNodeOrder = 'alphabetical' | 'connections';

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
