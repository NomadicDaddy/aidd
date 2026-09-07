import {
	type DependencyGraphNodeOrder,
	type FeatureDependencyCycle,
	type FeatureDependencyNode,
	GRAPH_COLUMN_GAP,
	GRAPH_NODE_HEIGHT,
	GRAPH_NODE_WIDTH,
	GRAPH_PADDING,
	GRAPH_ROW_GAP,
} from './dependencyGraphTypes.ts';

/** Keep authored `text-sm` node labels at or above the sanctioned 11px `text-2xs` floor. */
export const GRAPH_MIN_READABLE_SCALE = 11 / 14;

export function dependencyGraphViewportFit(
	viewportWidth: number | undefined,
	graphWidth: number,
): number {
	if (
		viewportWidth === undefined ||
		!Number.isFinite(viewportWidth) ||
		viewportWidth <= 0 ||
		!Number.isFinite(graphWidth) ||
		graphWidth <= 0
	) {
		return 1;
	}
	return Math.min(1, Math.max(GRAPH_MIN_READABLE_SCALE, viewportWidth / graphWidth));
}

function canonicalCycleKey(cycle: string[]): string {
	const closed = cycle.slice(0, -1);
	if (closed.length === 0) return '';
	let start = 0;
	for (let index = 1; index < closed.length; index++) {
		const candidate = closed[index];
		const current = closed[start];
		if (
			candidate !== undefined &&
			current !== undefined &&
			candidate.localeCompare(current) < 0
		) {
			start = index;
		}
	}
	const rotated = [...closed.slice(start), ...closed.slice(0, start)];
	return rotated.join('>');
}

function closeCycle(cycle: string[]): FeatureDependencyCycle {
	const closed = cycle.slice(0, -1);
	if (closed.length === 0) return { directories: cycle };
	let start = 0;
	for (let index = 1; index < closed.length; index++) {
		const candidate = closed[index];
		const current = closed[start];
		if (
			candidate !== undefined &&
			current !== undefined &&
			candidate.localeCompare(current) < 0
		) {
			start = index;
		}
	}
	const rotated = [...closed.slice(start), ...closed.slice(0, start)];
	return { directories: [...rotated, rotated[0] ?? ''] };
}

export function detectCycles(
	nodes: FeatureDependencyNode[],
	outgoing: Map<string, string[]>,
): FeatureDependencyCycle[] {
	const visited = new Set<string>();
	const stack: string[] = [];
	const stackSet = new Set<string>();
	const cycles = new Map<string, FeatureDependencyCycle>();

	function visit(directory: string): void {
		visited.add(directory);
		stack.push(directory);
		stackSet.add(directory);
		for (const target of outgoing.get(directory) ?? []) {
			if (!visited.has(target)) {
				visit(target);
				continue;
			}
			if (!stackSet.has(target)) continue;
			const start = stack.indexOf(target);
			if (start === -1) continue;
			const cycle = [...stack.slice(start), target];
			const key = canonicalCycleKey(cycle);
			if (key && !cycles.has(key)) cycles.set(key, closeCycle(cycle));
		}
		stack.pop();
		stackSet.delete(directory);
	}

	for (const node of nodes) {
		if (!visited.has(node.directory)) visit(node.directory);
	}
	return [...cycles.values()].sort((left, right) =>
		left.directories.join('>').localeCompare(right.directories.join('>')),
	);
}

function computeLayers(nodes: FeatureDependencyNode[]): Map<string, number> {
	const byDirectory = new Map(nodes.map((node) => [node.directory, node]));
	const layers = new Map<string, number>();

	function layerFor(directory: string, visiting: Set<string>): number {
		const cached = layers.get(directory);
		if (cached !== undefined) return cached;
		if (visiting.has(directory)) return 0;
		const node = byDirectory.get(directory);
		if (!node) return 0;
		visiting.add(directory);
		const dependencyLayers = node.resolvedDependencies
			.filter((dependency) => dependency !== directory)
			.map((dependency) => layerFor(dependency, visiting) + 1);
		visiting.delete(directory);
		const layer = dependencyLayers.length === 0 ? 0 : Math.max(...dependencyLayers);
		layers.set(directory, layer);
		return layer;
	}

	for (const node of nodes) {
		layerFor(node.directory, new Set<string>());
	}
	return layers;
}

function compareNodes(
	left: FeatureDependencyNode,
	right: FeatureDependencyNode,
	order: DependencyGraphNodeOrder,
): number {
	if (order === 'connections') {
		const leftConnections = left.resolvedDependencies.length + left.dependents.length;
		const rightConnections = right.resolvedDependencies.length + right.dependents.length;
		if (leftConnections !== rightConnections) return rightConnections - leftConnections;
	}
	return left.directory.localeCompare(right.directory);
}

export function positionNodes(
	nodes: FeatureDependencyNode[],
	maxWidth?: number,
	order: DependencyGraphNodeOrder = 'connections',
): FeatureDependencyNode[] {
	const layers = computeLayers(nodes);
	const rowsByLayer = new Map<number, FeatureDependencyNode[]>();
	for (const node of nodes) {
		const layer = layers.get(node.directory) ?? 0;
		const rows = rowsByLayer.get(layer) ?? [];
		rows.push({ ...node, layer });
		rowsByLayer.set(layer, rows);
	}
	const orderedLayers = [...rowsByLayer.entries()].sort((left, right) => left[0] - right[0]);
	const columnsByLayer = new Map(orderedLayers.map(([layer]) => [layer, 1]));
	if (maxWidth !== undefined && orderedLayers.length > 0) {
		const pitch = GRAPH_NODE_WIDTH + GRAPH_COLUMN_GAP;
		const fittingColumns = Math.floor(
			(maxWidth - GRAPH_PADDING * 2 + GRAPH_COLUMN_GAP) / pitch,
		);
		let spareColumns = Math.max(0, fittingColumns - orderedLayers.length);
		while (spareColumns > 0) {
			const densest = orderedLayers
				.filter(([layer, rows]) => rows.length > (columnsByLayer.get(layer) ?? 1))
				.sort(([leftLayer, leftRows], [rightLayer, rightRows]) => {
					const leftColumns = columnsByLayer.get(leftLayer) ?? 1;
					const rightColumns = columnsByLayer.get(rightLayer) ?? 1;
					const densityOrder =
						Math.ceil(rightRows.length / rightColumns) -
						Math.ceil(leftRows.length / leftColumns);
					return densityOrder === 0 ? leftLayer - rightLayer : densityOrder;
				})[0];
			if (!densest) break;
			columnsByLayer.set(densest[0], (columnsByLayer.get(densest[0]) ?? 1) + 1);
			spareColumns--;
		}
	}
	const positioned: FeatureDependencyNode[] = [];
	let columnOffset = 0;
	for (const [layer, rows] of orderedLayers) {
		rows.sort((left, right) => compareNodes(left, right, order));
		const layerColumns = columnsByLayer.get(layer) ?? 1;
		const rowsPerColumn = Math.ceil(rows.length / layerColumns);
		for (let index = 0; index < rows.length; index++) {
			const node = rows[index] as FeatureDependencyNode;
			const subcolumn = Math.floor(index / rowsPerColumn);
			const row = index % rowsPerColumn;
			positioned.push({
				...node,
				row,
				x:
					GRAPH_PADDING +
					(columnOffset + subcolumn) * (GRAPH_NODE_WIDTH + GRAPH_COLUMN_GAP),
				y: GRAPH_PADDING + row * (GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP),
			});
		}
		columnOffset += layerColumns;
	}
	return positioned.sort((left, right) => left.directory.localeCompare(right.directory));
}

export function graphSize(nodes: FeatureDependencyNode[]): { height: number; width: number } {
	if (nodes.length === 0) {
		return {
			height: GRAPH_PADDING * 2 + GRAPH_NODE_HEIGHT,
			width: GRAPH_PADDING * 2 + GRAPH_NODE_WIDTH,
		};
	}
	const maxX = Math.max(...nodes.map((node) => node.x));
	const maxY = Math.max(...nodes.map((node) => node.y));
	return {
		height: maxY + GRAPH_NODE_HEIGHT + GRAPH_PADDING,
		width: maxX + GRAPH_NODE_WIDTH + GRAPH_PADDING,
	};
}
