/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectDetail, ProjectFeature, ProjectRoadmapSummary } from '../../../api/types.ts';
import type { LaunchTargetValue } from '../../../api/types/launchDefaults.ts';

import { Card } from '../../../components/ui/card.tsx';
import { useLaunchRun, useRuns } from '../../../hooks/useRuns.ts';
import {
	GRAPH_ZOOM_DEFAULT,
	GRAPH_ZOOM_STEP,
	nextGraphZoom,
} from './dependencyGraphComponents.tsx';
import { DependencyGraphFilters } from './DependencyGraphFilters.tsx';
import {
	DependencyGraphCanvas,
	GraphDiagnosticsCard,
	SelectedFeaturePanel,
} from './dependencyGraphPanels.tsx';
import { buildFeatureDependencyGraph, featureByDirectory } from './dependencyGraphUtils.ts';
import { FeatureDetailsDialog } from './FeatureDetailsDialog.tsx';
import { FeatureLaunchTargetRow } from './FeatureLaunchTargetRow.tsx';
import {
	type FEATURE_STATUS_FILTER_OPTIONS,
	featureDirectory,
	featureMatchesFilters,
	milestoneFilterOptions,
	sortedSourceOptions,
} from './featuresUtils.ts';

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
	const graph = useMemo(() => buildFeatureDependencyGraph(features), [features]);
	const featureMap = useMemo(() => featureByDirectory(features), [features]);
	const nodeByDirectory = useMemo(
		() => new Map(graph.nodes.map((node) => [node.directory, node])),
		[graph.nodes],
	);
	const [detailsFeature, setDetailsFeature] = useState<null | ProjectFeature>(null);
	const [launchingFeature, setLaunchingFeature] = useState<null | string>(null);
	// Tab-level launch target for feature runs launched from the graph's selected panel.
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});
	const [milestoneFilter, setMilestoneFilter] = useState('all');
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
	const sourceOptions = useMemo(() => sortedSourceOptions(features), [features]);
	const milestoneOptions = useMemo(
		() => milestoneFilterOptions(features, roadmap),
		[features, roadmap],
	);
	const visibleDirectories = useMemo(
		() =>
			new Set(
				features
					.filter((feature) =>
						featureMatchesFilters(feature, {
							milestoneFilter,
							query,
							sourceFilter,
							statusFilter,
						}),
					)
					.map(featureDirectory),
			),
		[features, milestoneFilter, query, sourceFilter, statusFilter],
	);
	const visibleNodes = graph.nodes.filter((node) => visibleDirectories.has(node.directory));
	const visibleEdges = graph.edges.filter(
		(edge) => visibleDirectories.has(edge.source) && visibleDirectories.has(edge.target),
	);
	const selectedNode = selectedDirectory
		? (nodeByDirectory.get(selectedDirectory) ?? null)
		: null;
	const relatedDirectories = new Set([
		...(selectedNode ? [selectedNode.directory] : []),
		...(selectedNode?.resolvedDependencies ?? []),
		...(selectedNode?.dependents ?? []),
	]);

	useEffect(() => {
		if (selectedDirectory && !nodeByDirectory.has(selectedDirectory)) {
			setSelectedDirectory(null);
		}
	}, [nodeByDirectory, selectedDirectory]);

	function resetFilters(): void {
		setMilestoneFilter('all');
		setQuery('');
		setSourceFilter('all');
		setStatusFilter('all');
	}

	function resetZoom(): void {
		setZoom(GRAPH_ZOOM_DEFAULT);
	}

	function zoomIn(): void {
		setZoom((current) => nextGraphZoom(current, GRAPH_ZOOM_STEP));
	}

	function zoomOut(): void {
		setZoom((current) => nextGraphZoom(current, -GRAPH_ZOOM_STEP));
	}

	function openDetails(): void {
		if (!selectedNode) return;
		const feature = featureMap.get(selectedNode.directory);
		if (feature) setDetailsFeature(feature);
	}

	function launchSelectedFeature(): void {
		if (!selectedNode) return;
		const feature = featureMap.get(selectedNode.directory);
		if (!feature) return;
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
			<Card className="py-10 text-center text-sm text-muted-foreground">
				This project has no features in <code>.aidd/features</code> yet.
			</Card>
		);
	}

	return (
		<>
			{/* One full-width column. The 22rem rail used to be permanent, so the canvas — the only
			    thing on this tab that benefits from width — gave up ~370px to a panel that read
			    "Select a feature node" until something was selected. */}
			<div className="min-w-0 space-y-4">
				<DependencyGraphFilters
					graph={graph}
					milestoneFilter={milestoneFilter}
					milestoneOptions={milestoneOptions}
					onMilestoneFilterChange={setMilestoneFilter}
					onQueryChange={setQuery}
					onResetFilters={resetFilters}
					onResetZoom={resetZoom}
					onSourceFilterChange={setSourceFilter}
					onStatusFilterChange={(value) =>
						setStatusFilter(value as DependencyFilterStatus)
					}
					onZoomIn={zoomIn}
					onZoomOut={zoomOut}
					query={query}
					sourceFilter={sourceFilter}
					sourceOptions={sourceOptions}
					statusFilter={statusFilter}
					visibleCount={visibleNodes.length}
					zoom={zoom}
				/>
				<FeatureLaunchTargetRow
					label="Runs use"
					onChange={setLaunchTarget}
					projectDir={projectPath}
					value={launchTarget}
				/>
				{visibleNodes.length === 0 ? (
					<Card className="py-10 text-center text-sm text-muted-foreground">
						No dependency nodes match the active filters.
					</Card>
				) : (
					<div className="relative">
						<DependencyGraphCanvas
							graph={graph}
							nodeByDirectory={nodeByDirectory}
							onSelect={setSelectedDirectory}
							relatedDirectories={relatedDirectories}
							selectedNode={selectedNode}
							visibleEdges={visibleEdges}
							visibleNodes={visibleNodes}
							zoom={zoom}
						/>
						{/* The selection reads as an overlay on the graph it describes rather than
						    as a column that exists whether or not anything is selected. */}
						{selectedNode ? (
							<div className="absolute top-3 right-3 z-10 max-h-[calc(100%-1.5rem)] w-[min(22rem,calc(100%-1.5rem))] overflow-auto">
								<SelectedFeaturePanel
									hasActiveRun={hasActiveRun}
									isLaunching={launchingFeature === selectedNode.directory}
									node={selectedNode}
									nodeByDirectory={nodeByDirectory}
									onClose={() => setSelectedDirectory(null)}
									onLaunchRun={launchSelectedFeature}
									onOpenDetails={openDetails}
									onSelect={setSelectedDirectory}
								/>
							</div>
						) : null}
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
