import { useQueries, useQueryClient } from '@tanstack/react-query';
import { default as Bot } from 'lucide-react/dist/esm/icons/bot';
import { default as CheckCircle2 } from 'lucide-react/dist/esm/icons/check-circle-2';
import { default as FolderKanban } from 'lucide-react/dist/esm/icons/folder-kanban';
import { default as History } from 'lucide-react/dist/esm/icons/history';

import type { ProjectDetail, ProjectSummary } from '../../api/types.ts';
import type { DashboardCardDef } from './SortableDashboardGrid.tsx';

import { getProject } from '../../api/projects.ts';
import { DataFreshness } from '../../components/shared/DataFreshness.tsx';
import { Metric } from '../../components/shared/Metric.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { useDirectorCycles, useFleetSummary, useSuggestions } from '../../hooks/useDirector.ts';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useNow } from '../../hooks/useNow.ts';
import { usePortStatus, useProjects } from '../../hooks/useProjects.ts';
import { useRuns } from '../../hooks/useRuns.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { percent } from '../../lib/formatters.ts';
import { ActiveCycleBanner } from './ActiveCycleBanner.tsx';
import { ActiveRunsCard } from './ActiveRunsCard.tsx';
import { getHealthTone } from './dashboard-shared.ts';
import { DashboardLockToggle } from './DashboardLockToggle.tsx';
import { DirectorQueueCard } from './DirectorQueueCard.tsx';
import { buildFeatureQueue, FeatureQueueCard } from './FeatureQueueCard.tsx';
import { FeatureStatusCard } from './FeatureStatusCard.tsx';
import { FeatureSummaryCard } from './FeatureSummaryCard.tsx';
import { FleetHealthCard } from './FleetHealthCard.tsx';
import { ProjectHealthCard } from './ProjectHealthCard.tsx';
import { SortableDashboardGrid } from './SortableDashboardGrid.tsx';
import { WaitingApprovalCard } from './WaitingApprovalCard.tsx';

export function DashboardPage() {
	useDocumentTitle('Dashboard');
	const queryClient = useQueryClient();
	const projects = useProjects();
	const portStatus = usePortStatus();
	const runs = useRuns();
	const fleetQuery = useFleetSummary();
	const suggestionsQuery = useSuggestions();
	const cyclesQuery = useDirectorCycles();
	const cycleList = cyclesQuery.data ?? [];
	const activeCycle = cycleList.find((cycle) => cycle.status === 'running');
	const now = useNow(Boolean(activeCycle));
	const projectList = (projects.data?.projects ?? []).filter((p) => !p.name.endsWith('.old'));
	const featureStatusDetails = useQueries({
		queries: projectList.map((project) => ({
			enabled:
				(project.featureStats.total > 0 && (project.featureStatus?.length ?? 0) === 0) ||
				project.featureStats.waitingApproval > 0,
			queryFn: ({ signal }: { signal: AbortSignal }) => getProject(project.id, signal),
			queryKey: ['project', project.id],
			staleTime: 30_000,
		})),
	});
	const runList = runs.data?.pages.flatMap((page) => page.runs) ?? [];
	const activeRuns = runList.filter((run) => run.status === 'running');
	const totalFeatures = projectList.reduce((sum, project) => sum + project.featureStats.total, 0);
	const passingFeatures = projectList.reduce(
		(sum, project) => sum + project.featureStats.passing,
		0,
	);
	const fleet = fleetQuery.data;
	const projectIdByName = new Map(
		(projects.data?.projects ?? []).map((project) => [project.name, project.routeId]),
	);
	const featureQueue = buildFeatureQueue(fleet, projectIdByName);
	const fleetProjectCount = fleet?.fleetAggregations.projectCount ?? 0;
	const projectCount = projectList.length > 0 ? projectList.length : fleetProjectCount;
	const fleetFeatureTotalFromFleet =
		fleet?.projects.reduce((sum, project) => sum + project.featureCount, 0) ?? 0;
	const fleetFeaturePassingFromFleet =
		fleet?.projects.reduce((sum, project) => sum + project.completedCount, 0) ?? 0;
	const fleetFeatureTotal = totalFeatures > 0 ? totalFeatures : fleetFeatureTotalFromFleet;
	const fleetFeaturePassing = totalFeatures > 0 ? passingFeatures : fleetFeaturePassingFromFleet;
	// "Priority Health" metric = fleet feature-pass ratio (NOT fleetHealthScore, which is diagnostic
	// only). Definitions of record: docs/reference/dashboard-metrics.md.
	const featureHealthValue =
		fleetFeatureTotal > 0
			? percent(fleetFeaturePassing, fleetFeatureTotal)
			: (fleet?.fleetAggregations.featurePassRate ?? 0);
	const featureHealthTone = getHealthTone(featureHealthValue);
	const failingProjects = projectList.filter(
		(project) => project.priorityHealth.band !== 'healthy',
	);
	const pendingSuggestions =
		suggestionsQuery.data?.filter((suggestion) => suggestion.status === 'pending') ?? [];
	const healthyProjects = Math.max(projectCount - failingProjects.length, 0);
	const featureStatusProjects = projectList.map<ProjectDetail | ProjectSummary>(
		(project, index) => featureStatusDetails[index]?.data ?? project,
	);
	const featureStatusLoading =
		(projects.isLoading && !projects.data) ||
		featureStatusDetails.some((query) => query.isLoading && !query.data);
	const featureStatusError =
		projects.isError || featureStatusDetails.some((query) => query.isError);

	function refreshDashboard() {
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'dashboard.refresh',
			source: 'DashboardPage',
			summary: {
				queries: ['projects', 'runs', 'director.fleet', 'suggestions', 'director-cycles'],
			},
		});
		void Promise.all([
			queryClient.refetchQueries({ queryKey: ['projects'] }),
			queryClient.refetchQueries({ queryKey: ['runs'] }),
			queryClient.refetchQueries({ queryKey: ['director', 'fleet'] }),
			queryClient.refetchQueries({ queryKey: ['suggestions'] }),
			queryClient.refetchQueries({ queryKey: ['director-cycles'] }),
		]);
	}

	const cards: DashboardCardDef[] = [
		{
			id: 'fleet-health',
			label: 'Fleet Health',
			node: (
				<FleetHealthCard
					_fleetFeatureTotal={fleetFeatureTotal}
					failingProjects={failingProjects.length}
					featureHealthTone={featureHealthTone}
					featureHealthValue={featureHealthValue}
					fleet={fleet}
					fleetFeaturePassing={fleetFeaturePassing}
					healthyProjects={healthyProjects}
					projectCount={projectCount}
				/>
			),
		},
		{
			id: 'active-runs',
			label: 'Active Runs',
			node: (
				<ActiveRunsCard
					activeRuns={activeRuns}
					isLoading={runs.isLoading && runList.length === 0}
					runList={runList}
				/>
			),
		},
		{
			id: 'feature-summary',
			label: 'Feature Summary',
			node: (
				<FeatureSummaryCard
					isError={projects.isError}
					isLoading={projects.isLoading && !projects.data}
					onRetry={() => {
						void projects.refetch();
					}}
					projects={projectList}
				/>
			),
		},
		{
			id: 'feature-queue',
			label: 'Feature Queue',
			node: (
				<FeatureQueueCard
					isLoading={fleetQuery.isLoading && !fleetQuery.data}
					queue={featureQueue}
				/>
			),
		},
		{
			fullWidth: true,
			id: 'feature-status',
			label: 'Feature Status',
			node: (
				<FeatureStatusCard
					isError={featureStatusError}
					isLoading={featureStatusLoading}
					onRetry={() => {
						void projects.refetch();
						for (const query of featureStatusDetails) void query.refetch();
					}}
					projects={featureStatusProjects}
				/>
			),
		},
		{
			id: 'project-health',
			label: 'Project Health',
			node: (
				<ProjectHealthCard
					isError={projects.isError}
					isLoading={!projects.data && projects.isLoading}
					onRetry={() => {
						void projects.refetch();
					}}
					portStatus={portStatus.data}
					projects={projectList}
				/>
			),
		},
		{
			id: 'director-queue',
			label: 'Director Queue',
			node: (
				<DirectorQueueCard
					isLoading={suggestionsQuery.isLoading && pendingSuggestions.length === 0}
					suggestions={pendingSuggestions}
				/>
			),
		},
		{
			id: 'waiting-approval',
			label: 'Waiting Approval',
			node: (
				<WaitingApprovalCard
					isLoading={
						suggestionsQuery.isLoading ||
						(featureStatusLoading && pendingSuggestions.length === 0)
					}
					projects={featureStatusProjects}
					runList={runList}
					suggestions={suggestionsQuery.data ?? []}
				/>
			),
		},
	];

	return (
		<div className="page-reveal space-y-5">
			<PageHeader
				actions={
					<div className="flex items-center gap-2">
						<DashboardLockToggle />
						<DataFreshness
							label="Dashboard data"
							onRefresh={refreshDashboard}
							queries={[projects, runs, fleetQuery, suggestionsQuery, cyclesQuery]}
						/>
					</div>
				}
				description="Fleet state, runs, and director queue."
				helpSlug="dashboard"
				title="Dashboard"
			/>

			<section
				aria-label="Fleet metrics"
				className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<Metric
					detail={`${healthyProjects} healthy / ${failingProjects.length} Need Attention`}
					icon={<FolderKanban className="h-5 w-5" />}
					label="Projects"
					loading={projects.isLoading && !projects.data}
					tone="teal"
					value={projectCount}
				/>
				<Metric
					detail={activeRuns.length === 1 ? 'run in progress' : 'runs in progress'}
					icon={<History className="h-5 w-5" />}
					label="Active Runs"
					loading={runs.isLoading && runList.length === 0}
					tone={activeRuns.length > 0 ? 'amber' : 'emerald'}
					value={activeRuns.length}
				/>
				<Metric
					detail={`${fleetFeaturePassing}/${fleetFeatureTotal} passing`}
					icon={<CheckCircle2 className="h-5 w-5" />}
					label="Priority Health"
					loading={
						fleetQuery.isLoading &&
						!fleetQuery.data &&
						projects.isLoading &&
						!projects.data
					}
					tone={featureHealthTone}
					value={`${featureHealthValue}%`}
				/>
				<Metric
					detail="pending director actions"
					icon={<Bot className="h-5 w-5" />}
					label="Suggestions"
					loading={suggestionsQuery.isLoading && !suggestionsQuery.data}
					tone={pendingSuggestions.length > 0 ? 'amber' : 'emerald'}
					value={pendingSuggestions.length}
				/>
			</section>

			{activeCycle && <ActiveCycleBanner cycle={activeCycle} now={now} />}

			<SortableDashboardGrid cards={cards} />
		</div>
	);
}
