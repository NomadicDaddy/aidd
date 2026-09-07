import type { TelemetryOutcomeBucket } from 'aidd-shared/runs/outcome';

import { useState } from 'react';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines, SkeletonRows } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import {
	useTelemetryBackends,
	useTelemetryInvocations,
	useTelemetryOutputTimeseries,
	useTelemetryProjects,
	useTelemetryResources,
	useTelemetryTimeseries,
	useTelemetryTop,
} from '../../hooks/useTelemetry.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { humanizeEnum } from '../../lib/formatters.ts';
import { invocationOutcomeBucket } from './invocationOutcome.ts';
import { InvocationsTable } from './InvocationsTable.tsx';
import { LeaderboardCard } from './LeaderboardCard.tsx';
import { type OutputMetric, OutputTimeseriesChart } from './OutputTimeseriesChart.tsx';
import { ProjectCostSection } from './ProjectCostSection.tsx';
import { BackendBreakdownCard, TimeseriesChart } from './TelemetryComponents.tsx';
import { TelemetryDisclosure } from './TelemetryDisclosure.tsx';
import {
	telemetryTypeParam,
	telemetryWindowLabel,
	telemetryWindowMs,
	type TypeFilter,
	type WindowKey,
} from './telemetryFilters.ts';
import { TelemetryFilterToolbar } from './TelemetryFilterToolbar.tsx';
import { TelemetrySummary } from './TelemetrySummary.tsx';
import { sumTelemetryTotals } from './telemetryTotals.ts';
import { useTelemetryResourceAvailability } from './useTelemetryResourceAvailability.ts';

const PAGE_RAIL = pageRailByContentType.data;

const outputMetricOptions: { label: string; value: OutputMetric }[] = [
	{ label: 'Lines', value: 'lines' },
	{ label: 'Tokens', value: 'tokens' },
];

export function TelemetryPage() {
	useDocumentTitle('Telemetry');
	const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
	const [windowFilter, setWindowFilter] = useState<WindowKey>('7d');
	const [outputMetric, setOutputMetric] = useState<OutputMetric>('lines');
	const [outcomeFilter, setOutcomeFilter] = useState<null | TelemetryOutcomeBucket>(null);
	const availableResources = useTelemetryResourceAvailability();
	const windowMs = telemetryWindowMs(windowFilter);
	const typeParam = telemetryTypeParam(typeFilter);
	const bucket: 'day' | 'hour' = windowFilter === '24h' ? 'hour' : 'day';
	const outputApplies = typeFilter === 'all' || typeFilter === 'run';
	const topQuery = useTelemetryTop({
		limit: 10,
		...(typeParam ? { type: typeParam } : {}),
		...(windowMs ? { windowMs } : {}),
	});
	const timeseriesQuery = useTelemetryTimeseries({
		bucket,
		...(typeParam ? { type: typeParam } : {}),
		...(windowMs ? { windowMs } : {}),
	});
	const outputQuery = useTelemetryOutputTimeseries(
		{
			bucket,
			...(windowMs ? { windowMs } : {}),
		},
		outputApplies,
	);
	const invocationsQuery = useTelemetryInvocations({
		limit: 50,
		...(typeParam ? { type: typeParam } : {}),
		...(windowMs ? { windowMs } : {}),
	});
	const backendsQuery = useTelemetryBackends({
		...(typeParam ? { type: typeParam } : {}),
		...(windowMs ? { windowMs } : {}),
	});
	const resourceQuery = useTelemetryResources({
		...(typeParam ? { type: typeParam } : {}),
		...(windowMs ? { windowMs } : {}),
	});
	const projectsQuery = useTelemetryProjects({
		...(typeParam ? { type: typeParam } : {}),
		...(windowMs ? { windowMs } : {}),
	});

	const topRows = topQuery.data ?? [];
	const timeseriesPoints = timeseriesQuery.data ?? [];
	const outputPoints = outputQuery.data ?? [];
	const invocations = invocationsQuery.data ?? [];
	const backendRows = backendsQuery.data ?? [];
	const resourceRows = resourceQuery.data ?? [];
	const projectRows = projectsQuery.data ?? [];
	const totals = sumTelemetryTotals(resourceRows);
	const visibleInvocations = outcomeFilter
		? invocations.filter((invocation) => invocationOutcomeBucket(invocation) === outcomeFilter)
		: invocations;
	const outcomeTotal = outcomeFilter ? totals[outcomeFilter] : totals.total;
	const selectOutcome = (outcome: null | TelemetryOutcomeBucket) => {
		setOutcomeFilter(outcome);
		if (outcome === null) return;
		requestAnimationFrame(() => {
			const target = document.getElementById('recent-invocations');
			target?.focus({ preventScroll: true });
			target?.scrollIntoView({
				behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
					? 'auto'
					: 'smooth',
				block: 'start',
			});
		});
	};

	return (
		<PageRail className="page-reveal @container space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				description="Local usage, outcome, output, and health telemetry across skills, recipes, and runs."
				helpSlug="telemetry"
				title="Telemetry"
			/>
			<TelemetryFilterToolbar
				filtered={visibleInvocations.length}
				onOutcomeChange={selectOutcome}
				onTypeChange={(value) => {
					setTypeFilter(value);
					setOutcomeFilter(null);
				}}
				onWindowChange={(value) => {
					setWindowFilter(value);
					setOutcomeFilter(null);
				}}
				outcomeFilter={outcomeFilter}
				total={totals.total}
				typeFilter={typeFilter}
				windowFilter={windowFilter}
			/>
			<TelemetryDisclosure />

			<TelemetrySummary
				activeOutcome={outcomeFilter}
				onOutcomeChange={(outcome) =>
					selectOutcome(outcome === outcomeFilter ? null : outcome)
				}
				totals={totals}
				windowLabel={telemetryWindowLabel(windowFilter)}
			/>

			{/* Keep independent columns top-aligned and split by page width, after the sidebar. */}
			<section className="grid items-start gap-4 @min-[61rem]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
				<div className="space-y-4">
					<Card className="@container flex flex-col gap-3">
						<CardHeader
							className="mb-0"
							status={
								<span className="text-xs text-muted-foreground tabular-nums">
									Top {topRows.length}
								</span>
							}
							title="Most used"
						/>
						{topQuery.isLoading && topRows.length === 0 ? (
							<SkeletonLines count={6} label="Loading leaderboard…" />
						) : (
							<LeaderboardCard
								availableResources={availableResources}
								rows={topRows}
							/>
						)}
					</Card>
					<ProjectCostSection
						isError={projectsQuery.isError}
						isLoading={projectsQuery.isLoading}
						onRetry={() => void projectsQuery.refetch()}
						rows={projectRows}
					/>
				</div>
				<div className="space-y-4">
					<Card className="@container flex flex-col gap-3">
						<CardHeader
							badge={
								<Badge tone="neutral">
									{bucket === 'hour' ? 'per hour · UTC' : 'per day · UTC'}
								</Badge>
							}
							className="mb-0"
							title="Invocations over time"
						/>
						{timeseriesQuery.isLoading && timeseriesPoints.length === 0 ? (
							<SkeletonLines count={5} label="Loading timeseries…" />
						) : (
							<TimeseriesChart bucket={bucket} points={timeseriesPoints} />
						)}
					</Card>
					<Card className="@container flex flex-col gap-3">
						<CardHeader
							className="mb-0"
							description="All invocations in the selected filters."
							title="CLI mix"
						/>
						{backendsQuery.isLoading && backendRows.length === 0 ? (
							<SkeletonLines count={4} label="Loading CLI mix…" />
						) : (
							<BackendBreakdownCard rows={backendRows} />
						)}
					</Card>
					<Card className="@container flex flex-col gap-3">
						<CardHeader
							action={
								<SegmentedControl
									ariaLabel="Output metric"
									onChange={setOutputMetric}
									options={outputMetricOptions}
									value={outputMetric}
								/>
							}
							className="mb-0"
							description={
								<>
									{outputMetric === 'lines'
										? 'Lines added and removed by run commits'
										: 'Tokens consumed and produced by runs'}{' '}
									· {bucket === 'hour' ? 'per hour · UTC' : 'per day · UTC'}
								</>
							}
							title="Agent output"
						/>
						{!outputApplies ? (
							// This filter-driven state offers the action that restores output data.
							<EmptyState
								action={
									<Button onClick={() => setTypeFilter('all')} size="compact">
										Show all types
									</Button>
								}>
								Agent output is collected for runs.
							</EmptyState>
						) : outputQuery.isLoading && outputPoints.length === 0 ? (
							<SkeletonLines count={5} label="Loading agent output…" />
						) : (
							<OutputTimeseriesChart
								bucket={bucket}
								metric={outputMetric}
								points={outputPoints}
							/>
						)}
					</Card>
				</div>
			</section>

			<section
				aria-labelledby="recent-invocations-heading"
				className="focus:outline-none"
				id="recent-invocations"
				tabIndex={-1}>
				<Card className="flex flex-col gap-3">
					<CardHeader
						action={
							outcomeFilter ? (
								<Button onClick={() => selectOutcome(null)} variant="ghost">
									Clear outcome
								</Button>
							) : undefined
						}
						className="mb-0"
						id="recent-invocations-heading"
						status={
							<span className="text-xs text-muted-foreground tabular-nums">
								{outcomeFilter
									? `${visibleInvocations.length} of ${outcomeTotal} ${humanizeEnum(outcomeFilter)}`
									: `latest ${invocations.length} in window`}
							</span>
						}
						title="Recent invocations"
					/>
					{invocationsQuery.isLoading && invocations.length === 0 ? (
						<SkeletonRows columns={7} count={8} label="Loading invocations…" />
					) : (
						<InvocationsTable
							availableResources={availableResources}
							invocations={visibleInvocations}
						/>
					)}
				</Card>
			</section>
		</PageRail>
	);
}
