import { useState } from 'react';

import type { TelemetryResourceType } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines, SkeletonRows } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import {
	useTelemetryBackends,
	useTelemetryInvocations,
	useTelemetryOutputTimeseries,
	useTelemetryResources,
	useTelemetryTimeseries,
	useTelemetryTop,
} from '../../hooks/useTelemetry.ts';
import { InvocationsTable } from './InvocationsTable.tsx';
import { LeaderboardCard } from './LeaderboardCard.tsx';
import { type OutputMetric, OutputTimeseriesChart } from './OutputTimeseriesChart.tsx';
import { BackendBreakdownCard, TimeseriesChart } from './TelemetryComponents.tsx';
import { TelemetryDisclosure } from './TelemetryDisclosure.tsx';
import { TelemetrySummary } from './TelemetrySummary.tsx';

type TypeFilter = 'all' | TelemetryResourceType;
type WindowKey = '24h' | '30d' | '7d' | 'all';

const typeOptions: { label: string; value: TypeFilter }[] = [
	{ label: 'All', value: 'all' },
	{ label: 'Skills', value: 'skill' },
	{ label: 'Recipes', value: 'recipe' },
	{ label: 'Runs', value: 'run' },
];

const outputMetricOptions: { label: string; value: OutputMetric }[] = [
	{ label: 'Lines', value: 'lines' },
	{ label: 'Tokens', value: 'tokens' },
];

const windowOptions: { label: string; ms: number | undefined; value: WindowKey }[] = [
	{ label: '24h', ms: 24 * 60 * 60 * 1000, value: '24h' },
	{ label: '7d', ms: 7 * 24 * 60 * 60 * 1000, value: '7d' },
	{ label: '30d', ms: 30 * 24 * 60 * 60 * 1000, value: '30d' },
	{ label: 'All', ms: undefined, value: 'all' },
];

function asWindowMs(value: WindowKey): number | undefined {
	return windowOptions.find((option) => option.value === value)?.ms;
}

function asTypeParam(value: TypeFilter): TelemetryResourceType | undefined {
	return value === 'all' ? undefined : value;
}

export function TelemetryPage() {
	useDocumentTitle('Telemetry');
	const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
	const [windowFilter, setWindowFilter] = useState<WindowKey>('7d');
	const [outputMetric, setOutputMetric] = useState<OutputMetric>('lines');
	const windowMs = asWindowMs(windowFilter);
	const typeParam = asTypeParam(typeFilter);
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

	const topRows = topQuery.data ?? [];
	const timeseriesPoints = timeseriesQuery.data ?? [];
	const outputPoints = outputQuery.data ?? [];
	const invocations = invocationsQuery.data ?? [];
	const backendRows = backendsQuery.data ?? [];
	const resourceRows = resourceQuery.data ?? [];
	const totals = resourceRows.reduce(
		(acc, row) => ({
			completed: acc.completed + row.completed,
			failed: acc.failed + row.failed,
			flagged: acc.flagged + row.flagged,
			killed: acc.killed + row.killed,
			nested: acc.nested + row.nested,
			noWork: acc.noWork + row.noWork,
			running: acc.running + row.running,
			stopped: acc.stopped + row.stopped,
			topLevel: acc.topLevel + row.topLevel,
			total: acc.total + row.total,
			warnings: acc.warnings + row.warnings,
		}),
		{
			completed: 0,
			failed: 0,
			flagged: 0,
			killed: 0,
			nested: 0,
			noWork: 0,
			running: 0,
			stopped: 0,
			topLevel: 0,
			total: 0,
			warnings: 0,
		},
	);

	return (
		<div className="page-reveal @container space-y-5">
			<PageHeader
				description="Local usage, outcome, output, and health telemetry across skills, recipes, and runs."
				helpSlug="telemetry"
				title="Telemetry"
			/>
			{/* Two controls that scope one query, kept next to each other. `justify-between` pinned
			    Resource type to the left edge and Time window to the right, which at 2250 put 1516px
			    of empty card between them: nothing about the layout then said the two compose, and
			    setting one meant crossing the full width to check the other. They read as one filter
			    row now, and the card still wraps them at narrow widths. */}
			<Card className="flex flex-wrap items-center justify-start gap-3">
				<SegmentedControl
					ariaLabel="Resource type"
					onChange={setTypeFilter}
					options={typeOptions}
					value={typeFilter}
				/>
				<SegmentedControl
					ariaLabel="Time window"
					onChange={setWindowFilter}
					options={windowOptions}
					value={windowFilter}
				/>
			</Card>
			<TelemetryDisclosure />

			<TelemetrySummary
				totals={totals}
				windowLabel={
					windowOptions.find((option) => option.value === windowFilter)?.label ?? 'All'
				}
			/>

			{/* `items-start`, so a ten-row leaderboard does not stretch the three-card stack beside it
			    to its own height and leave 600px of empty canvas in whichever column is shorter.

			    Split on the page's own width rather than the viewport: the two columns are the
			    page's, not the window's, and `xl:` measured a box the sidebar had already taken
			    240px out of. */}
			<section className="grid items-start gap-4 @min-[61rem]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
				<Card className="@container flex flex-col gap-3">
					<CardHeader
						badge={<Badge tone="neutral">top {topRows.length}</Badge>}
						className="mb-0"
						title="Most used"
					/>
					{topQuery.isLoading && topRows.length === 0 ? (
						<SkeletonLines count={6} label="Loading leaderboard…" />
					) : (
						<LeaderboardCard rows={topRows} />
					)}
				</Card>
				<div className="space-y-4">
					<Card className="flex flex-col gap-3">
						<CardHeader
							badge={
								<Badge tone="neutral">
									{bucket === 'hour' ? 'per hour' : 'per day'}
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
					<Card className="flex flex-col gap-3">
						<CardHeader
							className="mb-0"
							description="All invocations in the selected filters."
							title="Backend mix"
						/>
						{backendsQuery.isLoading && backendRows.length === 0 ? (
							<SkeletonLines count={4} label="Loading backend mix…" />
						) : (
							<BackendBreakdownCard rows={backendRows} />
						)}
					</Card>
					<Card className="flex flex-col gap-3">
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
									· {bucket === 'hour' ? 'per hour' : 'per day'}
								</>
							}
							title="Agent output"
						/>
						{!outputApplies ? (
							// A filter-driven message, not a loading or absent-data state, so it gets
							// the shared empty surface and a control that undoes the filter causing it.
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

			<Card className="flex flex-col gap-3">
				<CardHeader
					badge={<Badge tone="neutral">latest {invocations.length} in window</Badge>}
					className="mb-0"
					title="Recent invocations"
				/>
				{invocationsQuery.isLoading && invocations.length === 0 ? (
					<SkeletonRows columns={7} count={8} label="Loading invocations…" />
				) : (
					<InvocationsTable invocations={invocations} />
				)}
			</Card>
		</div>
	);
}
