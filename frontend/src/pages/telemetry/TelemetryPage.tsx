import { useState } from 'react';

import type { TelemetryResourceType } from '../../api/types.ts';

import { SkeletonLines, SkeletonRows } from '../../components/shared/LoadingState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
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
import { OutputTimeseriesChart, type OutputMetric } from './OutputTimeseriesChart.tsx';
import { BackendBreakdownCard, LeaderboardCard, TimeseriesChart } from './TelemetryComponents.tsx';
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
		outputApplies
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
			killed: 0,
			nested: 0,
			noWork: 0,
			running: 0,
			stopped: 0,
			topLevel: 0,
			total: 0,
			warnings: 0,
		}
	);

	return (
		<div className="space-y-5">
			<PageHeader
				description="Local usage, outcome, output, and health telemetry across skills, recipes, and runs."
				helpSlug="telemetry"
				title="Telemetry"
			/>
			<Card className="flex flex-wrap items-center justify-between gap-3">
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

			<TelemetrySummary totals={totals} />

			<section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
				<Card className="space-y-3">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
							Most used
						</h2>
						<Badge tone="neutral">top {topRows.length}</Badge>
					</div>
					{topQuery.isLoading && topRows.length === 0 ? (
						<SkeletonLines count={6} label="Loading leaderboard…" />
					) : (
						<LeaderboardCard rows={topRows} />
					)}
				</Card>
				<div className="space-y-4">
					<Card className="space-y-3">
						<div className="flex items-center justify-between">
							<h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
								Invocations over time
							</h2>
							<Badge tone="neutral">
								{bucket === 'hour' ? 'per hour' : 'per day'}
							</Badge>
						</div>
						{timeseriesQuery.isLoading && timeseriesPoints.length === 0 ? (
							<SkeletonLines count={5} label="Loading timeseries…" />
						) : (
							<TimeseriesChart bucket={bucket} points={timeseriesPoints} />
						)}
					</Card>
					<Card className="space-y-3">
						<div>
							<h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
								Backend mix
							</h2>
							<p className="text-xs text-neutral-500">
								All invocations in the selected filters.
							</p>
						</div>
						{backendsQuery.isLoading && backendRows.length === 0 ? (
							<SkeletonLines count={4} label="Loading backend mix…" />
						) : (
							<BackendBreakdownCard rows={backendRows} />
						)}
					</Card>
					<Card className="space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
									Agent output
								</h2>
								<p className="text-xs text-neutral-500">
									{outputMetric === 'lines'
										? 'Lines added and removed by run commits'
										: 'Tokens consumed and produced by runs'}{' '}
									· {bucket === 'hour' ? 'per hour' : 'per day'}
								</p>
							</div>
							<SegmentedControl
								ariaLabel="Output metric"
								onChange={setOutputMetric}
								options={outputMetricOptions}
								value={outputMetric}
							/>
						</div>
						{!outputApplies ? (
							<p className="rounded-md border border-dashed border-neutral-300 p-4 text-xs text-neutral-500 dark:border-neutral-700">
								Agent output is collected for runs. Select All or Runs to view it.
							</p>
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

			<Card className="space-y-3">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
						Recent invocations
					</h2>
					<Badge tone="neutral">latest {invocations.length} in window</Badge>
				</div>
				{invocationsQuery.isLoading && invocations.length === 0 ? (
					<SkeletonRows columns={7} count={8} label="Loading invocations…" />
				) : (
					<InvocationsTable invocations={invocations} />
				)}
			</Card>
		</div>
	);
}
