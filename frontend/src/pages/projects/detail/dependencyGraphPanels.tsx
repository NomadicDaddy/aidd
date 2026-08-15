import type { ReactNode } from 'react';

import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as X } from 'lucide-react/dist/esm/icons/x';

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button, IconButton } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { humanizeEnum } from '../../../lib/formatters.ts';
import {
	DependencyList,
	GraphNodeButton,
	GraphSourceLegend,
	sourceBadgeTone,
	sourceLabels,
} from './dependencyGraphComponents.tsx';
import { DependencyEdgeLayer } from './dependencyGraphEdges.tsx';
import {
	type buildFeatureDependencyGraph,
	type FeatureDependencyEdge,
	type FeatureDependencyNode,
} from './dependencyGraphUtils.ts';
import { statusTone } from './shared.ts';

export function DependencyGraphCanvas({
	graph,
	header,
	nodeByDirectory,
	onSelect,
	relatedDirectories,
	selectedNode,
	visibleEdges,
	visibleNodes,
	zoom,
}: {
	graph: ReturnType<typeof buildFeatureDependencyGraph>;
	/** A strip above the canvas, for controls that govern what the canvas can launch. */
	header?: ReactNode;
	nodeByDirectory: Map<string, FeatureDependencyNode>;
	onSelect: (directory: string) => void;
	relatedDirectories: Set<string>;
	selectedNode: FeatureDependencyNode | null;
	visibleEdges: FeatureDependencyEdge[];
	visibleNodes: FeatureDependencyNode[];
	zoom: number;
}) {
	return (
		<Card className="min-w-0 overflow-hidden p-0" variant="sunken">
			{header}
			<GraphSourceLegend />
			{/* The graph bottoms out at the viewport instead of at `70vh`, the way the Code tab's
			    two panes already do. Capped at 70vh it was 916px of pane below 627px of chrome at
			    2250x1309, so the document scrolled as well as the pane and the wheel did different
			    things depending on where the cursor sat. The subtracted 34rem is the chrome above
			    and inside this card — app and page header, status strip, tab strip, intro, filter
			    card, and this card's own launch strip — measured after the intro lost its Card.
			    Below `lg` only the floor applies: there the page is meant to scroll as one column
			    and a nested scroller swallows the wheel on the way past. */}
			<OverflowScroller
				ariaLabel="Dependency graph canvas"
				scrollerClassName="min-h-[32rem] overflow-y-auto lg:h-[calc(100vh-34rem)]">
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
							graph={graph}
							nodeByDirectory={nodeByDirectory}
							selectedNode={selectedNode}
							visibleEdges={visibleEdges}
						/>
						{visibleNodes.map((node) => (
							<GraphNodeButton
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
					<h3 className="text-xs font-semibold text-red-600 uppercase dark:text-red-300">
						Cycles
					</h3>
					<ul className="mt-2 space-y-1.5">
						{graph.cycles.map((cycle) => (
							<li
								className="rounded-md border border-red-200 bg-red-50 px-3 py-2 font-mono text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
								key={cycle.directories.join('>')}>
								{cycle.directories.join(' -> ')}
							</li>
						))}
					</ul>
				</section>
			) : null}
			{graph.unresolvedDependencies.length > 0 ? (
				<section>
					<h3 className="text-xs font-semibold text-red-600 uppercase dark:text-red-300">
						Unresolved Dependencies
					</h3>
					<ul className="mt-2 space-y-1.5">
						{graph.unresolvedDependencies.map((item) => (
							<li
								className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
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

// Rendered as an overlay over the graph canvas, so it exists only while a node is selected —
// the empty-state placeholder it used to show in a permanent rail is gone with the rail.
export function SelectedFeaturePanel({
	hasActiveRun,
	isLaunching,
	node,
	nodeByDirectory,
	onClose,
	onLaunchRun,
	onOpenDetails,
	onSelect,
}: {
	hasActiveRun: boolean;
	isLaunching: boolean;
	node: FeatureDependencyNode | null;
	nodeByDirectory: Map<string, FeatureDependencyNode>;
	onClose: () => void;
	onLaunchRun: () => void;
	onOpenDetails: () => void;
	onSelect: (directory: string) => void;
}) {
	if (!node) return null;
	return (
		<Card className="space-y-5" variant="panel">
			<div className="space-y-2">
				<div className="flex items-start justify-between gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<Badge tone={statusTone(node.status)}>{humanizeEnum(node.status)}</Badge>
						<Badge tone={sourceBadgeTone(node.source)}>
							{sourceLabels[node.source]}
						</Badge>
						{node.milestone ? <Badge tone="neutral">{node.milestone}</Badge> : null}
					</div>
					<IconButton ariaLabel="Clear selection" onClick={onClose} variant="ghost">
						<X className="h-4 w-4" />
					</IconButton>
				</div>
				<h2 className="text-base font-semibold text-foreground">{node.title}</h2>
				<p className="font-mono text-xs break-all text-muted-foreground">
					{node.directory}
				</p>
			</div>
			<div className="grid grid-cols-2 gap-2 text-sm">
				<div className="rounded-md border border-border p-3">
					<p className="text-xs font-medium text-muted-foreground uppercase">
						Depends on
					</p>
					<p className="mt-1 text-lg font-semibold text-foreground">
						{node.resolvedDependencies.length}
					</p>
				</div>
				<div className="rounded-md border border-border p-3">
					<p className="text-xs font-medium text-muted-foreground uppercase">
						Dependents
					</p>
					<p className="mt-1 text-lg font-semibold text-foreground">
						{node.dependents.length}
					</p>
				</div>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button onClick={onOpenDetails} variant="secondary">
					<Eye className="h-4 w-4" />
					Details
				</Button>
				<Button
					disabled={hasActiveRun || isLaunching}
					onClick={onLaunchRun}
					title={
						hasActiveRun
							? 'A run for this project is already in progress'
							: 'Launch a feature-specific coding run'
					}>
					<Play className="h-4 w-4" />
					{isLaunching ? 'Launching' : hasActiveRun ? 'Run active' : 'Launch run'}
				</Button>
			</div>
			<DependencyList
				directories={node.resolvedDependencies}
				nodeByDirectory={nodeByDirectory}
				onSelect={onSelect}
				title="Dependencies"
			/>
			<DependencyList
				directories={node.dependents}
				nodeByDirectory={nodeByDirectory}
				onSelect={onSelect}
				title="Dependents"
			/>
			{node.missingDependencies.length > 0 ? (
				<section>
					<h3 className="text-xs font-semibold text-red-600 uppercase dark:text-red-300">
						Unresolved
					</h3>
					<ul className="mt-2 space-y-1.5">
						{node.missingDependencies.map((dependency) => (
							<li
								className="rounded-md border border-red-200 bg-red-50 px-3 py-2 font-mono text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
								key={dependency}>
								{dependency}
							</li>
						))}
					</ul>
				</section>
			) : null}
		</Card>
	);
}
