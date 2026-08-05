import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as Play } from 'lucide-react/dist/esm/icons/play';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { cn } from '../../../lib/cn.ts';
import {
	DependencyList,
	edgePath,
	GraphNodeButton,
	sourceBadgeTone,
	sourceLabels,
} from './dependencyGraphComponents.tsx';
import {
	type buildFeatureDependencyGraph,
	type FeatureDependencyEdge,
	type FeatureDependencyNode,
} from './dependencyGraphUtils.ts';
import { statusTone } from './shared.ts';

export function DependencyGraphCanvas({
	graph,
	nodeByDirectory,
	onSelect,
	relatedDirectories,
	selectedNode,
	visibleEdges,
	visibleNodes,
	zoom,
}: {
	graph: ReturnType<typeof buildFeatureDependencyGraph>;
	nodeByDirectory: Map<string, FeatureDependencyNode>;
	onSelect: (directory: string) => void;
	relatedDirectories: Set<string>;
	selectedNode: FeatureDependencyNode | null;
	visibleEdges: FeatureDependencyEdge[];
	visibleNodes: FeatureDependencyNode[];
	zoom: number;
}) {
	return (
		<Card className="min-w-0 overflow-hidden p-0">
			<div className="max-h-[70vh] min-h-[32rem] overflow-auto">
				<div
					data-dependency-graph-shell="true"
					style={{
						height: graph.height * zoom,
						width: graph.width * zoom,
					}}>
					<div
						className="relative origin-top-left bg-[linear-gradient(to_right,rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:28px_28px]"
						data-dependency-graph-canvas="true"
						style={{
							height: graph.height,
							transform: `scale(${zoom})`,
							width: graph.width,
						}}>
						<svg
							aria-hidden="true"
							className="absolute inset-0"
							height={graph.height}
							viewBox={`0 0 ${graph.width} ${graph.height}`}
							width={graph.width}>
							<defs>
								<marker
									id="dependency-edge-arrow"
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
									<path
										className={cn(
											'text-muted-foreground transition-all duration-150',
											isDimmedEdge && 'opacity-20',
											isSelectedEdge &&
												'text-teal-500 opacity-100 dark:text-teal-300',
										)}
										d={edgePath(source, target)}
										fill="none"
										key={edge.id}
										markerEnd="url(#dependency-edge-arrow)"
										stroke="currentColor"
										strokeLinecap="round"
										strokeWidth={isSelectedEdge ? 2.5 : 1.5}
									/>
								);
							})}
						</svg>
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
			</div>
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
		<Card className="space-y-4">
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

export function SelectedFeaturePanel({
	hasActiveRun,
	isLaunching,
	node,
	nodeByDirectory,
	onLaunchRun,
	onOpenDetails,
	onSelect,
}: {
	hasActiveRun: boolean;
	isLaunching: boolean;
	node: FeatureDependencyNode | null;
	nodeByDirectory: Map<string, FeatureDependencyNode>;
	onLaunchRun: () => void;
	onOpenDetails: () => void;
	onSelect: (directory: string) => void;
}) {
	if (!node) {
		return (
			<Card className="space-y-3">
				<CardHeader className="mb-0" title="Selection" />
				<p className="text-sm text-muted-foreground">
					Select a feature node to inspect links.
				</p>
			</Card>
		);
	}
	return (
		<Card className="space-y-5">
			<div className="space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<Badge tone={statusTone(node.status)}>{node.status}</Badge>
					<Badge tone={sourceBadgeTone(node.source)}>{sourceLabels[node.source]}</Badge>
					{node.milestone ? <Badge tone="neutral">{node.milestone}</Badge> : null}
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
