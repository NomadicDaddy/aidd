import { Link } from 'react-router';

import type {
	ResourceUsageRow,
	TelemetryBackendUsageRow,
	TelemetryResourceType,
	TelemetryTimeseriesPoint,
} from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import {
	formatDuration,
	formatRelativeAge,
	formatTelemetryBucketLabel,
} from '../../lib/formatters.ts';
import { TelemetryChartTable } from './TelemetryChartTable.tsx';

function resourceLink(type: TelemetryResourceType, id: string): string {
	if (type === 'recipe') return `/recipes/${id}`;
	if (type === 'run') return `/runs`;
	return '/skills';
}

function outcomeBreakdown(row: ResourceUsageRow): string {
	const outcomes = [
		{ count: row.completed, label: 'completed' },
		{ count: row.warnings, label: 'warnings' },
		{ count: row.failed, label: 'failed' },
		{ count: row.stopped, label: 'stopped' },
		{ count: row.killed, label: 'killed' },
		{ count: row.noWork, label: 'no work' },
		{ count: row.running, label: 'running' },
	];
	return outcomes
		.filter((outcome) => outcome.count > 0)
		.map((outcome) => `${outcome.count} ${outcome.label}`)
		.join(' · ');
}

export function LeaderboardCard({ rows }: { rows: ResourceUsageRow[] }) {
	if (rows.length === 0) return <EmptyState>No invocations recorded yet.</EmptyState>;
	const max = Math.max(...rows.map((row) => row.total), 1);
	return (
		<ol className="space-y-2">
			{rows.map((row, index) => {
				const width = Math.round((row.total / max) * 100);
				return (
					<li
						className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
						key={`${row.resourceType}:${row.resourceId}`}>
						<div className="flex items-baseline justify-between gap-3">
							<div className="min-w-0">
								<Link
									className="truncate text-sm font-medium text-neutral-950 hover:underline dark:text-neutral-50"
									to={resourceLink(row.resourceType, row.resourceId)}>
									<span className="text-neutral-400">#{index + 1}</span>{' '}
									{row.resourceName}
								</Link>
								<p className="truncate text-xs text-neutral-500">
									{row.resourceType} · {row.resourceId}
								</p>
							</div>
							<div className="shrink-0 text-right">
								<div className="text-sm font-semibold text-neutral-950 tabular-nums dark:text-neutral-50">
									{row.total}
								</div>
								<div className="text-[0.7rem] text-neutral-500">
									{outcomeBreakdown(row)}
								</div>
							</div>
						</div>
						<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
							<div
								aria-hidden="true"
								className="h-full rounded-full bg-teal-500"
								style={{ width: `${width}%` }}
							/>
						</div>
						<div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[0.7rem] text-neutral-500">
							<span className="space-x-2">
								<span>{row.topLevel} top-level</span>
								<span>{row.nested} nested</span>
							</span>
							<span>
								{row.lastUsedAt
									? `last ${formatRelativeAge(new Date(row.lastUsedAt).toISOString())}`
									: 'never used'}{' '}
								·{' '}
								{row.avgDurationMs !== null
									? `avg ${formatDuration(row.avgDurationMs)}`
									: '—'}
							</span>
						</div>
					</li>
				);
			})}
		</ol>
	);
}

export function TimeseriesChart({
	bucket,
	points,
}: {
	bucket: 'day' | 'hour';
	points: TelemetryTimeseriesPoint[];
}) {
	if (points.length === 0) return <EmptyState>No data in this window yet.</EmptyState>;
	const max = Math.max(...points.map((point) => point.total), 1);
	const chartHeadingId = 'telemetry-invocations-chart-heading';
	const tableRows = points.map((point) => ({
		bucket: formatTelemetryBucketLabel(bucket, point.bucket),
		values: [
			point.total,
			point.completed,
			point.warnings,
			point.failed,
			point.stopped,
			point.killed,
			point.noWork,
			point.running,
		],
	}));
	return (
		<div aria-labelledby={chartHeadingId} className="space-y-2" role="group">
			<h3 className="sr-only" id={chartHeadingId}>
				Invocations by time bucket
			</h3>
			<div aria-hidden="true" className="flex h-40 items-end gap-1">
				{points.map((point) => {
					const totalPct = Math.max(2, Math.round((point.total / max) * 100));
					const labelText = formatTelemetryBucketLabel(bucket, point.bucket);
					return (
						<div
							className="group flex h-full flex-1 flex-col items-center justify-end"
							key={point.bucket}
							title={`${labelText} · ${point.total} invocations (${point.completed} completed, ${point.warnings} warnings, ${point.failed} failed, ${point.stopped} stopped, ${point.killed} killed, ${point.noWork} no work, ${point.running} running)`}>
							{/* The wrapper needs a definite height for the stacked segments to size
						    against: percentage heights inside an auto-height flex wrapper compute
						    to 0 and the bars render invisible. Height carries the bucket total;
						    the segments split it proportionally via flex-grow. */}
							<div
								className="flex w-full flex-col-reverse"
								style={{ height: `${totalPct}%` }}>
								{point.completed > 0 && (
									<div
										className="min-h-0 w-full rounded-sm bg-emerald-500 group-hover:bg-emerald-400 dark:bg-emerald-600 dark:group-hover:bg-emerald-500"
										style={{ flexBasis: 0, flexGrow: point.completed }}
									/>
								)}
								{point.warnings > 0 && (
									<div
										className="min-h-0 w-full bg-amber-400 group-hover:bg-amber-300 dark:bg-amber-500 dark:group-hover:bg-amber-400"
										style={{ flexBasis: 0, flexGrow: point.warnings }}
									/>
								)}
								{point.failed > 0 && (
									<div
										className="min-h-0 w-full bg-red-400 group-hover:bg-red-300 dark:bg-red-500 dark:group-hover:bg-red-400"
										style={{ flexBasis: 0, flexGrow: point.failed }}
									/>
								)}
								{point.stopped > 0 && (
									<div
										className="min-h-0 w-full bg-neutral-400 group-hover:bg-neutral-300 dark:bg-neutral-600 dark:group-hover:bg-neutral-500"
										style={{ flexBasis: 0, flexGrow: point.stopped }}
									/>
								)}
								{point.killed > 0 && (
									<div
										className="min-h-0 w-full bg-orange-700 group-hover:bg-orange-600 dark:bg-orange-800 dark:group-hover:bg-orange-700"
										style={{ flexBasis: 0, flexGrow: point.killed }}
									/>
								)}
								{point.noWork > 0 && (
									<div
										className="min-h-0 w-full bg-slate-500 group-hover:bg-slate-400 dark:bg-slate-700 dark:group-hover:bg-slate-600"
										style={{ flexBasis: 0, flexGrow: point.noWork }}
									/>
								)}
								{point.running > 0 && (
									<div
										className="min-h-0 w-full bg-teal-500 group-hover:bg-teal-400 dark:bg-teal-600 dark:group-hover:bg-teal-500"
										style={{ flexBasis: 0, flexGrow: point.running }}
									/>
								)}
							</div>
						</div>
					);
				})}
			</div>
			<div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-neutral-500">
				<LegendDot className="bg-emerald-500" label="Completed" />
				<LegendDot className="bg-amber-400" label="Warnings" />
				<LegendDot className="bg-red-400" label="Failed" />
				<LegendDot className="bg-neutral-400" label="Stopped" />
				<LegendDot className="bg-orange-700" label="Killed" />
				<LegendDot className="bg-slate-500" label="No work" />
				<LegendDot className="bg-teal-500" label="Running" />
			</div>
			<TelemetryChartTable
				caption="Invocation totals and outcomes for each time bucket"
				columns={[
					'Total',
					'Completed',
					'Warnings',
					'Failed',
					'Stopped',
					'Killed',
					'No work',
					'Running',
				]}
				rows={tableRows}
			/>
		</div>
	);
}

function LegendDot({ className, label }: { className: string; label: string }) {
	return (
		<span className="flex items-center gap-1.5">
			<span aria-hidden="true" className={`h-2 w-2 rounded-full ${className}`} />
			{label}
		</span>
	);
}

export function BackendBreakdownCard({ rows }: { rows: TelemetryBackendUsageRow[] }) {
	if (rows.length === 0) return <EmptyState>No backends recorded yet.</EmptyState>;
	const max = rows[0]?.count ?? 1;
	return (
		<ul className="space-y-1.5">
			{rows.map((row) => {
				const backend = row.backend ?? '(not recorded)';
				return (
					<li key={backend}>
						<div className="flex items-baseline justify-between text-xs">
							<span className="font-mono text-neutral-700 dark:text-neutral-300">
								{backend}
							</span>
							<span className="text-neutral-500 tabular-nums">{row.count}</span>
						</div>
						<div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
							<div
								aria-hidden="true"
								className="h-full rounded-full bg-teal-500"
								style={{ width: `${Math.round((row.count / max) * 100)}%` }}
							/>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
