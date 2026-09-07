import { cn } from '../../../lib/cn.ts';
import { toneText } from '../../../lib/tones.ts';
import { edgePath } from './dependencyGraphComponents.tsx';
import { type FeatureDependencyEdge, type FeatureDependencyNode } from './dependencyGraphUtils.ts';

/**
 * The edge layer of the dependency graph: every connection, and the arrowheads that terminate them.
 *
 * Its own module because it is the one part of the canvas with a rendering rule of its own to state,
 * and the canvas around it is layout.
 */
export function DependencyEdgeLayer({
	blockedDependencies,
	graph,
	nodeByDirectory,
	selectedNode,
	visibleEdges,
}: {
	blockedDependencies: Set<string>;
	graph: {
		cycles: { directories: string[] }[];
		height: number;
		width: number;
	};
	nodeByDirectory: Map<string, FeatureDependencyNode>;
	selectedNode: FeatureDependencyNode | null;
	visibleEdges: FeatureDependencyEdge[];
}) {
	const cycleEdges = new Set(
		graph.cycles.flatMap((cycle) =>
			cycle.directories.slice(0, -1).map((directory, index) => {
				const target = cycle.directories[index + 1];
				return target ? `${directory}->${target}` : '';
			}),
		),
	);
	return (
		<svg
			aria-hidden="true"
			className="absolute inset-0"
			height={graph.height}
			viewBox={`0 0 ${graph.width} ${graph.height}`}
			width={graph.width}>
			<defs>
				{/* Two markers rather than one: a marker resolves `currentColor` against its own
				    inherited colour, not the colour of the path that references it, so a single
				    marker painted every one of the 306 arrowheads in the page text colour whatever
				    the edge under it was doing. */}
				<marker
					className="text-control-border"
					id="dependency-edge-arrow"
					markerHeight="8"
					markerWidth="8"
					orient="auto"
					refX="7"
					refY="4"
					viewBox="0 0 8 8">
					<path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
				</marker>
				<marker
					className="text-accent"
					id="dependency-edge-arrow-selected"
					markerHeight="8"
					markerWidth="8"
					orient="auto"
					refX="7"
					refY="4"
					viewBox="0 0 8 8">
					<path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
				</marker>
				<marker
					className={toneText.amber}
					id="dependency-edge-arrow-prerequisite"
					markerHeight="8"
					markerWidth="8"
					orient="auto"
					refX="7"
					refY="4"
					viewBox="0 0 8 8">
					<path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
				</marker>
				<marker
					className={toneText.red}
					id="dependency-edge-arrow-error"
					markerHeight="8"
					markerWidth="8"
					orient="auto"
					refX="7"
					refY="4"
					viewBox="0 0 8 8">
					<path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
				</marker>
			</defs>
			{[...nodeByDirectory.values()].flatMap((node) =>
				node.missingDependencies.map((dependency) => (
					<path
						className={toneText.red}
						d={`M ${Math.max(0, node.x - 40)} ${node.y + 54} L ${node.x} ${node.y + 54}`}
						fill="none"
						key={`${node.directory}:${dependency}`}
						markerEnd="url(#dependency-edge-arrow-error)"
						stroke="currentColor"
						strokeDasharray="4 3"
						strokeWidth="2"
					/>
				)),
			)}
			{visibleEdges.map((edge: FeatureDependencyEdge) => {
				const source = nodeByDirectory.get(edge.source);
				const target = nodeByDirectory.get(edge.target);
				if (!source || !target) return null;
				const isSelectedEdge =
					selectedNode !== null &&
					(edge.source === selectedNode.directory ||
						edge.target === selectedNode.directory);
				const isDimmedEdge = selectedNode !== null && !isSelectedEdge;
				const isCycleEdge = cycleEdges.has(`${edge.source}->${edge.target}`);
				const isPrerequisiteEdge = selectedNode?.directory === edge.target;
				const isBlockedPrerequisite =
					isPrerequisiteEdge && blockedDependencies.has(edge.source);
				return (
					// Edges are the substrate, not the subject. Three hundred of them at full
					// opacity in the text colour made the connections the highest-contrast thing on
					// the tab, drawn over the node cards they connect — so they sit on the control
					// boundary token,
					// hairline, and dimmed until a node picks one out.
					<path
						className={cn(
							'transition-[color,opacity] duration-150',
							isCycleEdge
								? `${toneText.red} opacity-100`
								: isBlockedPrerequisite
									? `${toneText.amber} opacity-100`
									: isSelectedEdge
										? 'text-accent opacity-100'
										: isDimmedEdge
											? 'text-control-border opacity-15'
											: 'text-control-border opacity-15',
						)}
						d={edgePath(source, target)}
						fill="none"
						key={edge.id}
						markerEnd={
							isCycleEdge
								? 'url(#dependency-edge-arrow-error)'
								: isBlockedPrerequisite
									? 'url(#dependency-edge-arrow-prerequisite)'
									: isSelectedEdge
										? 'url(#dependency-edge-arrow-selected)'
										: 'url(#dependency-edge-arrow)'
						}
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth={isSelectedEdge || isCycleEdge ? 2 : 1}
					/>
				);
			})}
		</svg>
	);
}
