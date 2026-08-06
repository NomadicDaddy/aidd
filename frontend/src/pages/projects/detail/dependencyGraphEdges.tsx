import { cn } from '../../../lib/cn.ts';
import { edgePath } from './dependencyGraphComponents.tsx';
import { type FeatureDependencyEdge, type FeatureDependencyNode } from './dependencyGraphUtils.ts';

/**
 * The edge layer of the dependency graph: every connection, and the arrowheads that terminate them.
 *
 * Its own module because it is the one part of the canvas with a rendering rule of its own to state,
 * and the canvas around it is layout.
 */
export function DependencyEdgeLayer({
	graph,
	nodeByDirectory,
	selectedNode,
	visibleEdges,
}: {
	graph: { height: number; width: number };
	nodeByDirectory: Map<string, FeatureDependencyNode>;
	selectedNode: FeatureDependencyNode | null;
	visibleEdges: FeatureDependencyEdge[];
}) {
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
					className="text-border"
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
			</defs>
			{visibleEdges.map((edge: FeatureDependencyEdge) => {
				const source = nodeByDirectory.get(edge.source);
				const target = nodeByDirectory.get(edge.target);
				if (!source || !target) return null;
				const isSelectedEdge =
					selectedNode !== null &&
					(edge.source === selectedNode.directory ||
						edge.target === selectedNode.directory);
				const isDimmedEdge = selectedNode !== null && !isSelectedEdge;
				return (
					// Edges are the substrate, not the subject. Three hundred of them at full
					// opacity in the text colour made the connections the highest-contrast thing on
					// the tab, drawn over the node cards they connect — so they sit on `border`,
					// hairline, and dimmed until a node picks one out.
					<path
						className={cn(
							'transition-all duration-150',
							isSelectedEdge
								? 'text-accent opacity-100'
								: isDimmedEdge
									? 'text-border opacity-15'
									: 'text-border opacity-70',
						)}
						d={edgePath(source, target)}
						fill="none"
						key={edge.id}
						markerEnd={
							isSelectedEdge
								? 'url(#dependency-edge-arrow-selected)'
								: 'url(#dependency-edge-arrow)'
						}
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth={isSelectedEdge ? 2 : 1}
					/>
				);
			})}
		</svg>
	);
}
