import { telemetryOutcomeOrder, telemetryOutcomePresentation } from 'aidd-shared/runs/outcome';

import type { TelemetryBackendUsageRow, TelemetryTimeseriesPoint } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { backendLabel } from '../../lib/backends.ts';
import { formatTelemetryAxisTick, formatTelemetryBucketLabel } from '../../lib/formatters.ts';
import { outcomePattern, outcomeSolid, outcomeSolidHover } from '../../lib/series.ts';
import { ChartAxes } from './ChartAxes.tsx';
import { niceAxisMax, singleSidedTicks } from './chartAxisScale.ts';
import { TelemetryBucketBar } from './TelemetryBucketBar.tsx';
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
		bucket: point.bucket,
		label: formatTelemetryBucketLabel(bucket, point.bucket),
		values: [point.total, ...telemetryOutcomeOrder.map((outcome) => point[outcome])],
	}));
	return (
		<div aria-labelledby={chartHeadingId} className="@container space-y-2" role="group">
			<h3 className="sr-only" id={chartHeadingId}>
				Invocations by time bucket
			</h3>
			<div>
				<ChartAxes
					categories={points.map((point) =>
						formatTelemetryAxisTick(bucket, point.bucket),
					)}
					ticks={singleSidedTicks(max, { integral: true })}>
					<div className="flex h-40 items-end gap-1 @min-[45rem]:h-64">
						{points.map((point) => {
							const totalPct = Math.max(2, Math.round((point.total / max) * 100));
							const labelText = formatTelemetryBucketLabel(bucket, point.bucket);
							const tooltip = `${labelText} · ${point.total} invocations (${point.completed} completed, ${point.warnings} warnings, ${point.failed} failed, ${point.flagged} flagged, ${point.stopped} stopped, ${point.killed} killed, ${point.noWork} no work, ${point.running} running)`;
							return (
								<div className="h-full min-w-0 flex-1" key={point.bucket}>
									<TelemetryBucketBar
										className="items-center justify-end"
										label={tooltip}>
										{/* The wrapper needs a definite height for the stacked segments to size
						    against: percentage heights inside an auto-height flex wrapper compute
						    to 0 and the bars render invisible. Height carries the bucket total;
						    the segments split it proportionally via flex-grow. */}
										<div
											className="flex w-full flex-col-reverse"
											style={{ height: `${totalPct}%` }}>
											{telemetryOutcomeOrder.map((outcome) => {
												const value = point[outcome];
												return value > 0 ? (
													<div
														aria-hidden="true"
														className={`min-h-0 w-full rounded-sm ${outcomeSolid[outcome]} ${outcomePattern[outcome]} ${outcomeSolidHover[outcome]}`}
														key={outcome}
														style={{ flexBasis: 0, flexGrow: value }}
													/>
												) : null;
											})}
										</div>
									</TelemetryBucketBar>
								</div>
							);
						})}
					</div>
				</ChartAxes>
			</div>
			<div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
				{telemetryOutcomeOrder.map((outcome) => (
					<LegendDot
						className={`${outcomeSolid[outcome]} ${outcomePattern[outcome]}`}
						key={outcome}
						label={telemetryOutcomePresentation[outcome].label}
					/>
				))}
			</div>
			<TelemetryChartTable
				caption="Invocation totals and outcomes for each time bucket"
				columns={[
					'Total',
					...telemetryOutcomeOrder.map(
						(outcome) => telemetryOutcomePresentation[outcome].label,
					),
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
	if (rows.length === 0) return <EmptyState>No CLIs recorded yet.</EmptyState>;
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
				const cli = backendLabel(backend);
				return (
					<li className="max-w-[46ch]" key={backend}>
						<div className="flex items-baseline justify-between gap-3 text-xs">
							<span className="text-foreground">{cli}</span>
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
