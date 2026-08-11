import type { TelemetryBackendUsageRow, TelemetryTimeseriesPoint } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { formatTelemetryAxisTick, formatTelemetryBucketLabel } from '../../lib/formatters.ts';
import { outcomeSolid, outcomeSolidHover } from '../../lib/series.ts';
import { ChartAxes } from './ChartAxes.tsx';
import { niceAxisMax, singleSidedTicks } from './chartAxisScale.ts';
import { TelemetryChartTable } from './TelemetryChartTable.tsx';

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
