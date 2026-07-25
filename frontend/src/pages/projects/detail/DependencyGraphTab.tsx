/* eslint-disable react-hooks/set-state-in-effect */
import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectDetail, ProjectFeature, ProjectRoadmapSummary } from '../../../api/types.ts';
import type { LaunchTargetValue } from '../../../api/types/launchDefaults.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { useLaunchRun, useRuns } from '../../../hooks/useRuns.ts';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import {
	FilterSelect,
	GRAPH_ZOOM_DEFAULT,
	GRAPH_ZOOM_STEP,
	GraphDiagnostics,
	GraphZoomControls,
	nextGraphZoom,
} from './dependencyGraphComponents.tsx';
import {
	DependencyGraphCanvas,
	GraphDiagnosticsCard,
	SelectedFeaturePanel,
} from './dependencyGraphPanels.tsx';
import { buildFeatureDependencyGraph, featureByDirectory } from './dependencyGraphUtils.ts';
import { FeatureDetailsDialog } from './FeatureDetailsDialog.tsx';
import { FeatureLaunchTargetRow } from './FeatureLaunchTargetRow.tsx';
import {
	FEATURE_STATUS_FILTER_OPTIONS,
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
			<Card className="py-10 text-center text-sm text-neutral-500">
				This project has no features in <code>.aidd/features</code> yet.
			</Card>
		);
	}

	return (
		<>
			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="min-w-0 space-y-4">
					<Card className="space-y-4">
						<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
							<div>
								<h2 className="text-sm font-semibold text-foreground">
									Feature Dependencies
								</h2>
								<GraphDiagnostics
									graph={graph}
									visibleCount={visibleNodes.length}
								/>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<GraphZoomControls
									onReset={resetZoom}
									onZoomIn={zoomIn}
									onZoomOut={zoomOut}
									zoom={zoom}
								/>
								<Button onClick={resetFilters} variant="secondary">
									<RotateCcw className="h-4 w-4" />
									Reset filters
								</Button>
							</div>
						</div>
						<div className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_12rem_13rem_12rem]">
							<label className="grid gap-1 text-xs font-medium text-neutral-500">
								<span className={fieldLabelClass}>Search</span>
								<div className="relative">
									<Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-neutral-400" />
									<Input
										aria-label="Search dependency graph"
										className="pl-9"
										onChange={(event) => setQuery(event.target.value)}
										placeholder="Filter dependencies"
										value={query}
									/>
								</div>
							</label>
							<FilterSelect
								label="Status"
								onChange={(value) =>
									setStatusFilter(value as DependencyFilterStatus)
								}
								options={FEATURE_STATUS_FILTER_OPTIONS.map((status) => ({
									label:
										status === 'all'
											? 'All statuses'
											: status === 'incomplete'
												? 'incomplete'
												: status,
									value: status,
								}))}
								value={statusFilter}
							/>
							<FilterSelect
								label="Source"
								onChange={setSourceFilter}
								options={[{ label: 'All sources', value: 'all' }, ...sourceOptions]}
								value={sourceFilter}
							/>
							<FilterSelect
								label="Milestone"
								onChange={setMilestoneFilter}
								options={[
									{ label: 'All milestones', value: 'all' },
									...milestoneOptions,
								]}
								value={milestoneFilter}
							/>
						</div>
					</Card>
					{visibleNodes.length === 0 ? (
						<Card className="py-10 text-center text-sm text-neutral-500">
							No dependency nodes match the active filters.
						</Card>
					) : (
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
					)}
				</div>
				<div className="space-y-4">
					<FeatureLaunchTargetRow
						label="Runs use"
						onChange={setLaunchTarget}
						projectDir={projectPath}
						value={launchTarget}
					/>
					<SelectedFeaturePanel
						hasActiveRun={hasActiveRun}
						isLaunching={launchingFeature === selectedNode?.directory}
						node={selectedNode}
						nodeByDirectory={nodeByDirectory}
						onLaunchRun={launchSelectedFeature}
						onOpenDetails={openDetails}
						onSelect={setSelectedDirectory}
					/>
					<GraphDiagnosticsCard graph={graph} />
				</div>
			</div>
			{detailsFeature ? (
				<FeatureDetailsDialog
					feature={detailsFeature}
					onClose={() => setDetailsFeature(null)}
					projectId={projectId}
				/>
			) : null}
		</>
	);
}
