import type { ReactNode, RefObject } from 'react';

import type { DependencyGraphViewportMetrics } from './useDependencyGraphViewport.ts';

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useViewportFill, viewportFillScrollerClass } from '../../../hooks/useViewportFill.ts';
import { cn } from '../../../lib/cn.ts';
import { toneBorder, toneSurface, toneText } from '../../../lib/tones.ts';
import { sectionCaptionClass } from '../../../lib/typography.ts';
import { GraphNodeButton, GraphSourceLegend } from './dependencyGraphComponents.tsx';
import { DependencyEdgeLayer } from './dependencyGraphEdges.tsx';
import {
	type buildFeatureDependencyGraph,
	type FeatureDependencyEdge,
	type FeatureDependencyNode,
} from './dependencyGraphUtils.ts';
import { DependencyGraphViewportControls } from './DependencyGraphViewportControls.tsx';

export function DependencyGraphCanvas({
	blockedDependencies,
	controls,
	graph,
	nodeByDirectory,
	onHorizontalViewportChange,
	onSelect,
	onVerticalViewportChange,
	relatedDirectories,
	scrollerRef,
	selectedNode,
	viewportMetrics,
	visibleEdges,
	visibleNodes,
	zoom,
}: {
	blockedDependencies: Set<string>;
	controls?: ReactNode;
	graph: ReturnType<typeof buildFeatureDependencyGraph>;
	nodeByDirectory: Map<string, FeatureDependencyNode>;
	onHorizontalViewportChange: (percent: number) => void;
	onSelect: (directory: string) => void;
	onVerticalViewportChange: (percent: number) => void;
	relatedDirectories: Set<string>;
	scrollerRef: RefObject<HTMLDivElement | null>;
	selectedNode: FeatureDependencyNode | null;
	viewportMetrics: DependencyGraphViewportMetrics;
	visibleEdges: FeatureDependencyEdge[];
	visibleNodes: FeatureDependencyNode[];
	zoom: number;
}) {
	const canvasRef = useViewportFill<HTMLDivElement>({
		floor: 'graph',
		refreshKey: graph.height,
	});
	const cycleDirectories = new Set(graph.cycles.flatMap((cycle) => cycle.directories));
	return (
		<Card className="min-w-0 overflow-hidden p-0" variant="sunken">
			<GraphSourceLegend
				action={
					<div className="flex items-center gap-2">
						<DependencyGraphViewportControls
							metrics={viewportMetrics}
							onHorizontalChange={onHorizontalViewportChange}
							onVerticalChange={onVerticalViewportChange}
						/>
						{controls}
					</div>
				}
			/>
			{/* Measure from the canvas's real top edge. Diagnostics extend natural page flow only on
			    the exceptional graphs that actually render them. */}
			<OverflowScroller
				ariaLabel="Dependency graph canvas"
				rootRef={canvasRef}
				scrollerClassName={viewportFillScrollerClass}
				scrollerRef={scrollerRef}
				surface="muted">
				<div
					data-dependency-graph-shell="true"
					style={{
						height: graph.height * zoom,
						width: graph.width * zoom,
					}}>
					<div
						className="relative origin-top-left"
						data-dependency-graph-canvas="true"
						style={{
							height: graph.height,
							transform: `scale(${zoom})`,
							width: graph.width,
						}}>
						<DependencyEdgeLayer
							blockedDependencies={blockedDependencies}
							graph={graph}
							nodeByDirectory={nodeByDirectory}
							selectedNode={selectedNode}
							visibleEdges={visibleEdges}
						/>
						{visibleNodes.map((node) => (
							<GraphNodeButton
								hasError={
									cycleDirectories.has(node.directory) ||
									node.missingDependencies.length > 0
								}
								isDimmed={
									selectedNode !== null && !relatedDirectories.has(node.directory)
								}
								isRelated={relatedDirectories.has(node.directory)}
								isSelected={selectedNode?.directory === node.directory}
								key={node.directory}
								node={node}
								onSelect={onSelect}
							/>
						))}
					</div>
				</div>
			</OverflowScroller>
		</Card>
	);
}

export function GraphDiagnosticsCard({
	graph,
}: {
	graph: ReturnType<typeof buildFeatureDependencyGraph>;
}) {
	if (graph.cycles.length === 0 && graph.unresolvedDependencies.length === 0) return null;
	return (
		<Card className="flex flex-col gap-4">
			<CardHeader className="mb-0" title="Graph Diagnostics" />
			{graph.cycles.length > 0 ? (
				<section>
					<h3 className={cn(sectionCaptionClass, toneText.red)}>Cycles</h3>
					<ul className="mt-2 space-y-1.5">
						{graph.cycles.map((cycle) => (
							<li
								className={cn(
									'rounded-md border px-3 py-2 font-mono text-xs',
									toneBorder.red,
									toneSurface.red,
									toneText.red,
								)}
								key={cycle.directories.join('>')}>
								{cycle.directories.join(' -> ')}
							</li>
						))}
					</ul>
				</section>
			) : null}
			{graph.unresolvedDependencies.length > 0 ? (
				<section>
					<h3 className={cn(sectionCaptionClass, toneText.red)}>
						Unresolved Dependencies
					</h3>
					<ul className="mt-2 space-y-1.5">
						{graph.unresolvedDependencies.map((item) => (
							<li
								className={cn(
									'rounded-md border px-3 py-2 text-xs',
									toneBorder.red,
									toneSurface.red,
									toneText.red,
								)}
								key={`${item.featureDirectory}:${item.dependencyId}`}>
								<span className="font-mono">{item.featureDirectory}</span>{' '}
								references <span className="font-mono">{item.dependencyId}</span>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</Card>
	);
}
