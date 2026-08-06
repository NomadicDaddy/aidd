import { Link } from 'react-router';

import type {
	ResourceUsageRow,
	TelemetryBackendUsageRow,
	TelemetryResourceType,
	TelemetryTimeseriesPoint,
} from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { Card } from '../../components/ui/card.tsx';
import {
	formatDuration,
	formatRelativeAge,
	formatTelemetryAxisTick,
	formatTelemetryBucketLabel,
} from '../../lib/formatters.ts';
import { outcomeSolid, outcomeSolidHover } from '../../lib/series.ts';
import { ChartAxes } from './ChartAxes.tsx';
import { niceAxisMax, singleSidedTicks } from './chartAxisScale.ts';
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
		{ count: row.flagged, label: 'flagged' },
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
	const totals = rows.map((row) => row.total);
	const max = Math.max(...totals, 1);
	// A bar scaled against the maximum encodes nothing when every row holds the same count: ten
	// identical full-width bars spent the strongest colour on the card to say "these are equal",
	// which the tabular counts already say. Drop the bar in that case rather than draw a lie.
	const ranks = max !== Math.min(...totals);
	return (
		<ol className="space-y-2">
			{rows.map((row, index) => {
				const width = Math.round((row.total / max) * 100);
				return (
					<li key={`${row.resourceType}:${row.resourceId}`}>
						{/* A sunken fill rather than a second border of the same weight as the card
						    that contains it — the nesting reads by surface, not by outline. */}
						<Card className="p-3" variant="sunken">
							<div className="flex items-baseline justify-between gap-3">
								<div className="min-w-0">
									<Link
										className="truncate text-sm font-medium text-foreground hover:underline"
										to={resourceLink(row.resourceType, row.resourceId)}>
										<span className="text-muted-foreground">#{index + 1}</span>{' '}
										{row.resourceName}
									</Link>
									<p className="truncate text-xs text-muted-foreground">
										{row.resourceType} · {row.resourceId}
									</p>
								</div>
								<div className="shrink-0 text-right">
									<div className="text-sm font-semibold text-foreground tabular-nums">
										{row.total}
									</div>
									<div className="text-2xs text-muted-foreground">
										{outcomeBreakdown(row)}
									</div>
								</div>
							</div>
							{ranks ? (
								<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
									<div
										aria-hidden="true"
										className="h-full rounded-full bg-accent"
										style={{ width: `${width}%` }}
									/>
								</div>
							) : null}
							<div className="mt-1.5 flex flex-wrap justify-between gap-2 text-2xs text-muted-foreground">
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
						</Card>
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
	// The bars scale against the same rounded domain the ticks label, so a bar's height means what
	// the axis says it means. Invocations are counts, so the domain stays whole.
	const max = niceAxisMax(Math.max(...points.map((point) => point.total), 1), { integral: true });
	const chartHeadingId = 'telemetry-invocations-chart-heading';
	const tableRows = points.map((point) => ({
		bucket: formatTelemetryBucketLabel(bucket, point.bucket),
		values: [
			point.total,
			point.completed,
			point.warnings,
			point.failed,
			point.flagged,
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
			<div aria-hidden="true">
				<ChartAxes
					categories={points.map((point) =>
						formatTelemetryAxisTick(bucket, point.bucket),
					)}
					ticks={singleSidedTicks(max, { integral: true })}>
					<div className="flex h-40 items-end gap-1">
						{points.map((point) => {
							const totalPct = Math.max(2, Math.round((point.total / max) * 100));
							const labelText = formatTelemetryBucketLabel(bucket, point.bucket);
							return (
								<div
									className="group flex h-full flex-1 flex-col items-center justify-end"
									key={point.bucket}
									title={`${labelText} · ${point.total} invocations (${point.completed} completed, ${point.warnings} warnings, ${point.failed} failed, ${point.flagged} flagged, ${point.stopped} stopped, ${point.killed} killed, ${point.noWork} no work, ${point.running} running)`}>
									{/* The wrapper needs a definite height for the stacked segments to size
						    against: percentage heights inside an auto-height flex wrapper compute
						    to 0 and the bars render invisible. Height carries the bucket total;
						    the segments split it proportionally via flex-grow. */}
									<div
										className="flex w-full flex-col-reverse"
										style={{ height: `${totalPct}%` }}>
										{point.completed > 0 && (
											<div
												className={`min-h-0 w-full rounded-sm ${outcomeSolid.completed} ${outcomeSolidHover.completed}`}
												style={{ flexBasis: 0, flexGrow: point.completed }}
											/>
										)}
										{point.warnings > 0 && (
											<div
												className={`min-h-0 w-full ${outcomeSolid.warnings} ${outcomeSolidHover.warnings}`}
												style={{ flexBasis: 0, flexGrow: point.warnings }}
											/>
										)}
										{point.failed > 0 && (
											<div
												className={`min-h-0 w-full ${outcomeSolid.failed} ${outcomeSolidHover.failed}`}
												style={{ flexBasis: 0, flexGrow: point.failed }}
											/>
										)}
										{point.flagged > 0 && (
											<div
												className={`min-h-0 w-full ${outcomeSolid.flagged} ${outcomeSolidHover.flagged}`}
												style={{ flexBasis: 0, flexGrow: point.flagged }}
											/>
										)}
										{point.stopped > 0 && (
											<div
												className={`min-h-0 w-full ${outcomeSolid.stopped} ${outcomeSolidHover.stopped}`}
												style={{ flexBasis: 0, flexGrow: point.stopped }}
											/>
										)}
										{point.killed > 0 && (
											<div
												className={`min-h-0 w-full ${outcomeSolid.killed} ${outcomeSolidHover.killed}`}
												style={{ flexBasis: 0, flexGrow: point.killed }}
											/>
										)}
										{point.noWork > 0 && (
											<div
												className={`min-h-0 w-full ${outcomeSolid.noWork} ${outcomeSolidHover.noWork}`}
												style={{ flexBasis: 0, flexGrow: point.noWork }}
											/>
										)}
										{point.running > 0 && (
											<div
												className={`min-h-0 w-full ${outcomeSolid.running} ${outcomeSolidHover.running}`}
												style={{ flexBasis: 0, flexGrow: point.running }}
											/>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</ChartAxes>
			</div>
			<div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground">
				<LegendDot className={outcomeSolid.completed} label="Completed" />
				<LegendDot className={outcomeSolid.warnings} label="Warnings" />
				<LegendDot className={outcomeSolid.failed} label="Failed" />
				<LegendDot className={outcomeSolid.flagged} label="Flagged" />
				<LegendDot className={outcomeSolid.stopped} label="Stopped" />
				<LegendDot className={outcomeSolid.killed} label="Killed" />
				<LegendDot className={outcomeSolid.noWork} label="No work" />
				<LegendDot className={outcomeSolid.running} label="Running" />
			</div>
			<TelemetryChartTable
				caption="Invocation totals and outcomes for each time bucket"
				columns={[
					'Total',
					'Completed',
					'Warnings',
					'Failed',
					'Flagged',
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
	const counts = rows.map((row) => row.count);
	const max = Math.max(...counts, 1);
	// The same guard `LeaderboardCard` above makes, for the same reason: a bar scaled against the
	// maximum encodes nothing when every row holds it. A single-row breakdown drew a full-width
	// accent bar across the whole card that could only ever be 100% — the strongest colour on the
	// card spent saying what the count beside it already said.
	const ranks = max !== Math.min(...counts);
	return (
		<ul className="space-y-1.5">
			{rows.map((row) => {
				const backend = row.backend ?? '(not recorded)';
				return (
					<li key={backend}>
						<div className="flex items-baseline justify-between text-xs">
							<span className="font-mono text-foreground">{backend}</span>
							<span className="text-muted-foreground tabular-nums">{row.count}</span>
						</div>
						{ranks ? (
							<div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
								<div
									aria-hidden="true"
									className="h-full rounded-full bg-accent"
									style={{ width: `${Math.round((row.count / max) * 100)}%` }}
								/>
							</div>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}
