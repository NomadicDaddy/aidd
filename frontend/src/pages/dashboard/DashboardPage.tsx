import { useQueryClient } from '@tanstack/react-query';

import type { DashboardCardDef } from './SortableDashboardGrid.tsx';

import { DataFreshness } from '../../components/shared/DataFreshness.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { useDashboardProjectSummary } from '../../hooks/useDashboardSummary.ts';
import { useDirectorCycles, useFleetSummary, useSuggestions } from '../../hooks/useDirector.ts';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useNow } from '../../hooks/useNow.ts';
import { useRuns } from '../../hooks/useRuns.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { percent } from '../../lib/formatters.ts';
import { ActiveCycleBanner } from './ActiveCycleBanner.tsx';
import { ActiveRunsCard } from './ActiveRunsCard.tsx';
import { getHealthTone } from './dashboard-shared.ts';
import { DashboardLockToggle } from './DashboardLockToggle.tsx';
import { DashboardMetrics } from './DashboardMetrics.tsx';
import { DirectorQueueCard } from './DirectorQueueCard.tsx';
import { buildFeatureQueue, FeatureQueueCard } from './FeatureQueueCard.tsx';
import { FeatureStatusCard } from './FeatureStatusCard.tsx';
import { FeatureSummaryCard } from './FeatureSummaryCard.tsx';
import { FleetActivityCard } from './FleetActivityCard.tsx';
import { FleetMaturityCard } from './FleetMaturityCard.tsx';
import { ProjectHealthCard } from './ProjectHealthCard.tsx';
import { projectsReading } from './projectsReading.ts';
import { SortableDashboardGrid } from './SortableDashboardGrid.tsx';
import { WAITING_APPROVAL_MAX_ITEMS, WaitingApprovalCard } from './WaitingApprovalCard.tsx';

const PAGE_RAIL = pageRailByContentType.data;

export function DashboardPage() {
	useDocumentTitle('Dashboard');
	const queryClient = useQueryClient();
	// One bounded query for every project card on this page. `useProjects()` (the full listing,
	// every feature record of every project) is deliberately not read here — see
	// useDashboardSummary.ts.
	const summary = useDashboardProjectSummary();
	const runs = useRuns();
	const fleetQuery = useFleetSummary();
	const suggestionsQuery = useSuggestions();
	const cyclesQuery = useDirectorCycles();
	const cycleList = cyclesQuery.data ?? [];
	const activeCycle = cycleList.find((cycle) => cycle.status === 'running');
	const now = useNow(Boolean(activeCycle));
	const allProjects = summary.data?.projects ?? [];
	const projectList = allProjects.filter((p) => !p.name.endsWith('.old'));
	const runList = runs.data?.pages.flatMap((page) => page.runs) ?? [];
	const activeRuns = runList.filter((run) => run.status === 'running');
	const totalFeatures = projectList.reduce((sum, project) => sum + project.featureTotal, 0);
	const passingFeatures = projectList.reduce((sum, project) => sum + project.featurePassing, 0);
	const fleet = fleetQuery.data;
	const projectIdByName = new Map(allProjects.map((project) => [project.name, project.routeId]));
	const featureQueue = buildFeatureQueue(fleet, projectIdByName);
	const featureQueueTotal =
		fleet?.projects.reduce((sum, project) => sum + project.backlog.feature.count, 0) ?? 0;
	const fleetProjectCount = fleet?.fleetAggregations.projectCount ?? 0;
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
	const pendingSuggestions =
		suggestionsQuery.data?.filter((suggestion) => suggestion.status === 'pending') ?? [];
	const projectsForTile = projectsReading(projectList, fleetProjectCount, summary.isError);
	const summaryLoading = summary.isLoading && !summary.data;

	async function refreshDashboard(): Promise<boolean> {
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'dashboard.refresh',
			source: 'DashboardPage',
			summary: {
				queries: [
					'projects.dashboard-summary',
					'runs',
					'director.fleet',
					'suggestions',
					'director-cycles',
				],
			},
		});
		const results = await Promise.allSettled([
			queryClient.refetchQueries({ queryKey: ['projects'] }, { throwOnError: true }),
			queryClient.refetchQueries({ queryKey: ['runs'] }, { throwOnError: true }),
			queryClient.refetchQueries({ queryKey: ['director', 'fleet'] }, { throwOnError: true }),
			queryClient.refetchQueries({ queryKey: ['suggestions'] }, { throwOnError: true }),
			queryClient.refetchQueries({ queryKey: ['director-cycles'] }, { throwOnError: true }),
		]);
		return results.every((result) => result.status === 'fulfilled');
	}

	const healthBand = fleet?.fleetAggregations.priorityHealth.band;

	const cards: DashboardCardDef[] = [
		{
			id: 'waiting-approval',
			label: 'Waiting Approval',
			node: (
				<WaitingApprovalCard
					features={summary.data?.waitingApproval.features ?? []}
					featureTotal={summary.data?.waitingApproval.total ?? 0}
					isLoading={
						suggestionsQuery.isLoading ||
						(summaryLoading && pendingSuggestions.length === 0)
					}
					runList={runList}
					suggestions={suggestionsQuery.data ?? []}
				/>
			),
		},
		{
			id: 'director-queue',
			label: 'Director Queue',
			node: (
				<DirectorQueueCard
					isLoading={suggestionsQuery.isLoading && pendingSuggestions.length === 0}
					// The overflow, not the same list again. Waiting Approval fills its rows with
					// pending suggestions before anything else, so these are exactly the ones it
					// has no room for; see the note on WAITING_APPROVAL_MAX_ITEMS.
					suggestions={pendingSuggestions.slice(WAITING_APPROVAL_MAX_ITEMS)}
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
					total={featureQueueTotal}
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
			fullWidth: true,
			id: 'feature-summary',
			label: 'Feature Summary',
			node: (
				<FeatureSummaryCard
					isError={summary.isError}
					isLoading={summaryLoading}
					onRetry={() => {
						void summary.refetch();
					}}
					projects={projectList}
				/>
			),
		},
		{
			fullWidth: true,
			id: 'feature-status',
			label: 'Feature Status',
			node: (
				<FeatureStatusCard
					buckets={summary.data?.featureStatus.buckets ?? []}
					isError={summary.isError}
					isLoading={summaryLoading}
					onRetry={() => {
						void summary.refetch();
					}}
				/>
			),
		},
		{
			id: 'fleet-maturity',
			label: 'Fleet Maturity',
			node: (
				<FleetMaturityCard
					isError={summary.isError}
					isLoading={summaryLoading}
					onRetry={() => {
						void summary.refetch();
					}}
					projects={projectList}
				/>
			),
		},
		{
			id: 'recent-activity',
			label: 'Recent Activity',
			node: (
				<FleetActivityCard
					isError={summary.isError}
					isLoading={summaryLoading}
					items={summary.data?.recentActivity.items ?? []}
					onRetry={() => {
						void summary.refetch();
					}}
					total={summary.data?.recentActivity.total ?? 0}
				/>
			),
		},
		{
			id: 'project-health',
			label: 'Project Health',
			node: (
				<ProjectHealthCard
					isError={summary.isError}
					isLoading={summaryLoading}
					onRetry={() => {
						void summary.refetch();
					}}
					projects={projectList}
				/>
			),
		},
	];

	return (
		<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				actions={
					<div className="flex items-center gap-2">
						<DashboardLockToggle />
						<DataFreshness
							label="Dashboard data"
							onRefresh={refreshDashboard}
							sources={[
								{ label: 'Projects', query: summary },
								{ label: 'Runs', query: runs },
								{ label: 'Fleet summary', query: fleetQuery },
								{ label: 'Suggestions', query: suggestionsQuery },
								{ label: 'Director cycles', query: cyclesQuery },
							]}
						/>
					</div>
				}
				description="Start with waiting approvals, review Director suggestions, queue features, then monitor active runs."
				helpSlug="dashboard"
				title="Dashboard"
			/>
			<DashboardMetrics
				activeRunCount={activeRuns.length}
				featureHealthTone={featureHealthTone}
				featureHealthValue={featureHealthValue}
				fleetFeaturePassing={fleetFeaturePassing}
				fleetFeatureTotal={fleetFeatureTotal}
				healthBand={healthBand}
				onRetryProjects={() => {
					void summary.refetch();
				}}
				pendingSuggestionCount={pendingSuggestions.length}
				priorityHealthLoading={fleetQuery.isLoading && !fleetQuery.data && summaryLoading}
				projectsLoading={summaryLoading}
				projectsReading={projectsForTile}
				runsLoading={runs.isLoading && runList.length === 0}
				suggestionsLoading={suggestionsQuery.isLoading && !suggestionsQuery.data}
			/>

			{activeCycle && <ActiveCycleBanner cycle={activeCycle} now={now} />}

			<SortableDashboardGrid cards={cards} />
		</PageRail>
	);
}
