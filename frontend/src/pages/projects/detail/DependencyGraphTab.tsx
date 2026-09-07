/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectDetail, ProjectFeature, ProjectRoadmapSummary } from '../../../api/types.ts';
import type { LaunchTargetValue } from '../../../api/types/launchDefaults.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { useLaunchRun, useRuns } from '../../../hooks/useRuns.ts';
import { useViewportFill } from '../../../hooks/useViewportFill.ts';
import { cn } from '../../../lib/cn.ts';
import { dependencyFilterRegister } from './dependencyFilterRegister.ts';
import { GRAPH_ZOOM_DEFAULT } from './dependencyGraphComponents.tsx';
import { DependencyGraphFilters } from './DependencyGraphFilters.tsx';
import { dependencyGraphViewportFit, GRAPH_MIN_READABLE_SCALE } from './dependencyGraphLayout.ts';
import { DependencyGraphCanvas, GraphDiagnosticsCard } from './dependencyGraphPanels.tsx';
import {
	buildFeatureDependencyGraph,
	type DependencyGraphNodeOrder,
	featureByDirectory,
	fitFeatureDependencyGraph,
} from './dependencyGraphUtils.ts';
import { DependencyGraphZoomControls } from './DependencyGraphZoomControls.tsx';
import { FeatureDetailsDialog } from './FeatureDetailsDialog.tsx';
import { featureCanLaunchRun, featureLaunchGate } from './featureLaunchEligibility.ts';
import { FeatureLaunchTargetRow } from './FeatureLaunchTargetRow.tsx';
import {
	type FEATURE_STATUS_FILTER_OPTIONS,
	featureDirectory,
	featureMatchesFilters,
	milestoneFilterOptions,
	sortedSourceOptions,
} from './featuresUtils.ts';
import { SelectedFeaturePanel } from './SelectedFeaturePanel.tsx';
import { useDependencyGraphViewport } from './useDependencyGraphViewport.ts';

type DependencyFilterStatus = (typeof FEATURE_STATUS_FILTER_OPTIONS)[number];

export function DependencyGraphTab({
	features,
	projectId,
	projectPath,
	roadmap,
}: {
	features: ProjectDetail['features'];
	projectId: string;
	projectPath: string;
	roadmap: null | ProjectRoadmapSummary;
}) {
	const graph = buildFeatureDependencyGraph(features);
	const featureMap = featureByDirectory(features);
	const [detailsFeature, setDetailsFeature] = useState<null | ProjectFeature>(null);
	const [launchingFeature, setLaunchingFeature] = useState<null | string>(null);
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});
	const [milestoneFilter, setMilestoneFilter] = useState('all');
	const [order, setOrder] = useState<DependencyGraphNodeOrder>('connections');
	const [query, setQuery] = useState('');
	const [selectedDirectory, setSelectedDirectory] = useState<null | string>(null);
	const [sourceFilter, setSourceFilter] = useState('all');
	const [statusFilter, setStatusFilter] = useState<DependencyFilterStatus>('all');
	const [zoom, setZoom] = useState(GRAPH_ZOOM_DEFAULT);
	const launchRun = useLaunchRun();
	const runs = useRuns(projectPath);
	const hasActiveRun =
		projectPath.trim().length > 0 &&
		(runs.data?.pages.some((page) => page.runs.some((run) => run.status === 'running')) ??
			false);
	const sourceOptions = sortedSourceOptions(features);
	const milestoneOptions = milestoneFilterOptions(features, roadmap);
	const filteredDirectories = features
		.filter((feature) =>
			featureMatchesFilters(feature, {
				milestoneFilter,
				query,
				sourceFilter,
				statusFilter,
			}),
		)
		.map(featureDirectory);
	const visibleDirectories = new Set(filteredDirectories);
	const graphViewport = useDependencyGraphViewport(
		`${filteredDirectories.length}:${milestoneFilter}:${order}:${query}:${sourceFilter}:${statusFilter}:${zoom}`,
	);
	const selectedPanelRef = useViewportFill<HTMLDivElement>({
		floor: 'graph',
		refreshKey: selectedDirectory,
	});
	const visibleGraph = fitFeatureDependencyGraph(
		graph,
		visibleDirectories,
		graphViewport.width,
		order,
	);
	// Stop fitting at the readable text floor; expose the remaining canvas through the scroller.
	const viewportFit = dependencyGraphViewportFit(graphViewport.width, visibleGraph.width);
	const renderedZoom = Math.max(GRAPH_MIN_READABLE_SCALE, zoom * viewportFit);
	const visibleNodeByDirectory = new Map(
		visibleGraph.nodes.map((node) => [node.directory, node]),
	);
	const graphNodeByDirectory = new Map(graph.nodes.map((node) => [node.directory, node]));
	const selectedDirectoryVisible =
		selectedDirectory === null || visibleDirectories.has(selectedDirectory);
	const selectedNode = selectedDirectory
		? (graphNodeByDirectory.get(selectedDirectory) ?? null)
		: null;
	const selectedFeature = selectedNode ? featureMap.get(selectedNode.directory) : undefined;
	const blockedDependencies = new Set(
		selectedFeature ? featureLaunchGate(selectedFeature, features).blockedBy : [],
	);
	const relatedDirectories = new Set([
		...(selectedNode ? [selectedNode.directory] : []),
		...(selectedNode?.resolvedDependencies ?? []),
		...(selectedNode?.dependents ?? []),
	]);
	useEffect(() => {
		if (selectedDirectory && !selectedDirectoryVisible) {
			setSelectedDirectory(null);
		}
	}, [selectedDirectory, selectedDirectoryVisible]);
	useEffect(() => {
		const panel = selectedPanelRef.current;
		const canvas = graphViewport.ref.current;
		if (!selectedDirectory || !panel || !canvas) return;
		if (panel.getBoundingClientRect().top >= canvas.getBoundingClientRect().bottom - 1) {
			panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}, [graphViewport.ref, selectedDirectory, selectedPanelRef]);
	function resetFilters(): void {
		setMilestoneFilter('all');
		setQuery('');
		setSourceFilter('all');
		setStatusFilter('all');
		setOrder('connections');
	}
	const emptyFilters = dependencyFilterRegister({
		milestoneFilter,
		milestoneOptions,
		onReset: resetFilters,
		order,
		query,
		sourceFilter,
		sourceOptions,
		statusFilter,
	});

	function selectDirectory(directory: string): void {
		if (!visibleDirectories.has(directory)) resetFilters();
		setSelectedDirectory(directory);
	}

	function openDetails(): void {
		if (!selectedNode) return;
		const feature = featureMap.get(selectedNode.directory);
		if (feature) setDetailsFeature(feature);
	}

	function launchSelectedFeature(): void {
		if (!selectedNode) return;
		const feature = featureMap.get(selectedNode.directory);
		if (!feature || !featureCanLaunchRun(feature, features)) return;
		const directory = featureDirectory(feature);
		setLaunchingFeature(directory);
		launchRun.mutate(
			{
				feature: directory,
				mode: 'coding',
				projectDir: projectPath,
				...(launchTarget.backend ? { backend: launchTarget.backend } : {}),
				...(launchTarget.model ? { model: launchTarget.model } : {}),
				...(launchTarget.reasoningEffort
					? { reasoningEffort: launchTarget.reasoningEffort }
					: {}),
			},
			{
				onError: (error) =>
					toast.error(
						error instanceof Error ? error.message : 'Failed to launch coding run',
					),
				onSettled: () => setLaunchingFeature(null),
				onSuccess: () => toast.success('Feature-specific coding run launched'),
			},
		);
	}

	if (features.length === 0) {
		return (
			<EmptyState>
				This project has no features in <code>.aidd/features</code> yet.
			</EmptyState>
		);
	}

	return (
		<>
			<div className="min-w-0 space-y-4">
				<TabIntro
					description="How this project's features depend on one another. Select a node to see what it blocks and what blocks it."
					title="Dependencies"
				/>
				<DependencyGraphFilters
					graph={graph}
					hasFilters={emptyFilters !== undefined}
					milestoneFilter={milestoneFilter}
					milestoneOptions={milestoneOptions}
					onMilestoneFilterChange={setMilestoneFilter}
					onOrderChange={setOrder}
					onQueryChange={setQuery}
					onResetFilters={resetFilters}
					onSourceFilterChange={setSourceFilter}
					onStatusFilterChange={(value) =>
						setStatusFilter(value as DependencyFilterStatus)
					}
					order={order}
					query={query}
					sourceFilter={sourceFilter}
					sourceOptions={sourceOptions}
					statusFilter={statusFilter}
					visibleCount={filteredDirectories.length}
					visibleGraph={visibleGraph}
				/>
				{visibleGraph.nodes.length === 0 ? (
					<EmptyState filterReset="toolbar" filters={emptyFilters}>
						No dependency nodes match the active filters.
					</EmptyState>
				) : (
					<div className="@container min-w-0">
						<div
							className={cn(
								'grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4',
								selectedNode && '@min-[100rem]:grid-cols-[minmax(0,1fr)_22rem]',
							)}>
							<DependencyGraphCanvas
								blockedDependencies={blockedDependencies}
								controls={
									<DependencyGraphZoomControls
										effectiveZoom={renderedZoom}
										onChange={setZoom}
										viewportFit={viewportFit}
										zoom={zoom}
									/>
								}
								graph={visibleGraph}
								nodeByDirectory={visibleNodeByDirectory}
								onHorizontalViewportChange={graphViewport.scrollToHorizontalPercent}
								onSelect={selectDirectory}
								onVerticalViewportChange={graphViewport.scrollToVerticalPercent}
								relatedDirectories={relatedDirectories}
								scrollerRef={graphViewport.ref}
								selectedNode={selectedNode}
								viewportMetrics={graphViewport.metrics}
								visibleEdges={visibleGraph.edges}
								visibleNodes={visibleGraph.nodes}
								zoom={renderedZoom}
							/>
							{selectedNode ? (
								<OverflowScroller
									ariaLabel="Selected feature details"
									bottomCueLabel="More feature details"
									className="min-w-0 @min-[100rem]:sticky @min-[100rem]:top-4"
									rootRef={selectedPanelRef}
									scrollerClassName="@min-[100rem]:max-h-[var(--fill-height)] @min-[100rem]:overflow-y-auto"
									showTopCue>
									<SelectedFeaturePanel
										hasActiveRun={hasActiveRun}
										inventory={features}
										isLaunching={launchingFeature === selectedNode.directory}
										launchTarget={
											<FeatureLaunchTargetRow
												onChange={setLaunchTarget}
												projectDir={projectPath}
												value={launchTarget}
											/>
										}
										node={selectedNode}
										nodeByDirectory={graphNodeByDirectory}
										onClose={() => setSelectedDirectory(null)}
										onLaunchRun={launchSelectedFeature}
										onOpenDetails={openDetails}
										onSelect={selectDirectory}
									/>
								</OverflowScroller>
							) : null}
						</div>
					</div>
				)}
				<GraphDiagnosticsCard graph={graph} />
			</div>
			{detailsFeature ? (
				<FeatureDetailsDialog
					feature={detailsFeature}
					features={features}
					onClose={() => setDetailsFeature(null)}
					projectId={projectId}
				/>
			) : null}
		</>
	);
}
