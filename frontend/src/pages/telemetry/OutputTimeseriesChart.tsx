import type { TelemetryOutputTimeseriesPoint } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import {
	formatCompactNumber,
	formatTelemetryAxisTick,
	formatTelemetryBucketLabel,
} from '../../lib/formatters.ts';
import {
	outputSeriesPattern,
	outputSeriesSolid,
	outputSeriesSolidHover,
} from '../../lib/series.ts';
import { ChartAxes } from './ChartAxes.tsx';
import { divergingTicks, niceAxisMax } from './chartAxisScale.ts';
import { TelemetryBucketBar } from './TelemetryBucketBar.tsx';
import { TelemetryChartTable } from './TelemetryChartTable.tsx';

export type OutputMetric = 'lines' | 'tokens';

// Diverging bars from a shared center baseline: production (lines added / tokens in) grows up,
// the counterpart (lines removed / tokens out) grows down. One symmetric domain keeps lengths
// comparable across that baseline. Position carries the sign; semantic fill and texture identify
// the arms without making this supporting metric the page's loudest colour.
export function OutputTimeseriesChart({
	bucket,
	metric,
	points,
}: {
	bucket: 'day' | 'hour';
	metric: OutputMetric;
	points: TelemetryOutputTimeseriesPoint[];
}) {
	if (points.length === 0) return <EmptyState>No runs in this window yet.</EmptyState>;
	const upValue = (point: TelemetryOutputTimeseriesPoint) =>
		metric === 'lines' ? point.linesAdded : point.inputTokens;
	const downValue = (point: TelemetryOutputTimeseriesPoint) =>
		metric === 'lines' ? point.linesRemoved : point.outputTokens;
	const capturedRuns = (point: TelemetryOutputTimeseriesPoint) =>
		metric === 'lines' ? point.runsWithLineData : point.runsWithTokenData;
	if (!points.some((point) => capturedRuns(point) > 0)) {
		return (
			<EmptyState>
				{metric === 'lines'
					? 'No line counts captured yet — they are recorded when a run with commits finishes.'
					: 'No token usage captured yet — it is recorded when a run finishes.'}
			</EmptyState>
		);
	}
	const domain = niceAxisMax(
		points.reduce((max, point) => Math.max(max, upValue(point), downValue(point)), 1),
	);
	const totalUp = points.reduce((sum, point) => sum + upValue(point), 0);
	const totalDown = points.reduce((sum, point) => sum + downValue(point), 0);
	const totalRuns = points.reduce((sum, point) => sum + point.runs, 0);
	const totalCaptured = points.reduce((sum, point) => sum + capturedRuns(point), 0);
	const totalCachedTokens = points.reduce((sum, point) => sum + point.cachedTokens, 0);
	const totalFilesChanged = points.reduce((sum, point) => sum + point.filesChanged, 0);
	const totalReasoningTokens = points.reduce((sum, point) => sum + point.reasoningTokens, 0);
	const runsWithFileData = points.reduce((sum, point) => sum + point.runsWithFileData, 0);
	const upLabel = metric === 'lines' ? 'Added' : 'Tokens in';
	const downLabel = metric === 'lines' ? 'Removed' : 'Tokens out';
	const chartHeadingId = `telemetry-output-${metric}-chart-heading`;
	const tableColumns =
		metric === 'lines'
			? ['Lines added', 'Lines removed', 'Files changed', 'Runs captured', 'Total runs']
			: [
					'Tokens in',
					'Tokens out',
					'Cached tokens',
					'Reasoning tokens',
					'Runs captured',
					'Total runs',
				];
	const tableRows = points.map((point) => ({
		bucket: point.bucket,
		label: formatTelemetryBucketLabel(bucket, point.bucket),
		values:
			metric === 'lines'
				? [
						point.linesAdded,
						point.linesRemoved,
						point.filesChanged,
						point.runsWithLineData,
						point.runs,
					]
				: [
						point.inputTokens,
						point.outputTokens,
						point.cachedTokens,
						point.reasoningTokens,
						point.runsWithTokenData,
						point.runs,
					],
	}));
	return (
		<div aria-labelledby={chartHeadingId} className="@container space-y-2" role="group">
			<h3 className="sr-only" id={chartHeadingId}>
				{metric === 'lines' ? 'Line changes' : 'Token usage'} by time bucket
			</h3>
			{/* The 50% gridline is the shared center baseline the two arms diverge from, so the
			    chart does not draw one of its own. Signed ticks make the gutter monotonic from the
			    positive produced arm through zero to the negative counterpart arm. */}
			<ChartAxes
				categories={points.map((point) => formatTelemetryAxisTick(bucket, point.bucket))}
				ticks={divergingTicks(domain)}>
				{/* Shorter than the single-sided chart: the two arms split this height evenly, and the
					    smaller arm is routinely a fifth of its half, so `h-40` left a persistent empty
					    band between the bars and the legend. */}
				<div className="relative flex h-32 gap-1 @min-[45rem]:h-48">
					{points.map((point) => {
						const up = upValue(point);
						const down = downValue(point);
						const captured = capturedRuns(point);
						const tooltip = [
							formatTelemetryBucketLabel(bucket, point.bucket),
							metric === 'lines'
								? `+${up.toLocaleString()} / −${down.toLocaleString()} lines · ${point.filesChanged.toLocaleString()} files changed`
								: `${up.toLocaleString()} in / ${down.toLocaleString()} out · ${point.cachedTokens.toLocaleString()} cached · ${point.reasoningTokens.toLocaleString()} reasoning`,
							`${captured}/${point.runs} runs captured`,
						].join(' · ');
						return (
							<div className="h-full min-w-0 flex-1" key={point.bucket}>
								<TelemetryBucketBar label={tooltip}>
									<div className="flex flex-1 items-end">
										{up > 0 && (
											<div
												className={`w-full rounded-t-sm ${outputSeriesSolid.produced} ${outputSeriesPattern.produced} ${outputSeriesSolidHover.produced}`}
												style={{
													height: `${Math.max(2, Math.round((up / domain) * 100))}%`,
												}}
											/>
										)}
									</div>
									<div className="flex flex-1 items-start">
										{down > 0 && (
											<div
												className={`w-full rounded-b-sm ${outputSeriesSolid.counterpart} ${outputSeriesPattern.counterpart} ${outputSeriesSolidHover.counterpart}`}
												style={{
													height: `${Math.max(2, Math.round((down / domain) * 100))}%`,
												}}
											/>
										)}
									</div>
								</TelemetryBucketBar>
							</div>
						);
					})}
				</div>
			</ChartAxes>
			<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
				<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:gap-4">
					<span className="flex min-w-0 items-center gap-1.5">
						<span
							aria-hidden="true"
							className={`h-2 w-3 rounded-sm ${outputSeriesSolid.produced} ${outputSeriesPattern.produced}`}
						/>
						{upLabel}{' '}
						<span className="font-medium text-foreground tabular-nums">
							{formatCompactNumber(totalUp)}
						</span>
					</span>
					<span className="flex min-w-0 items-center gap-1.5">
						<span
							aria-hidden="true"
							className={`h-2 w-3 rounded-sm ${outputSeriesSolid.counterpart} ${outputSeriesPattern.counterpart}`}
						/>
						{downLabel}{' '}
						<span className="font-medium text-foreground tabular-nums">
							{formatCompactNumber(totalDown)}
						</span>
					</span>
					{metric === 'lines' ? (
						<span className="min-w-0 whitespace-nowrap">
							Files changed{' '}
							<span className="font-medium text-foreground tabular-nums">
								{formatCompactNumber(totalFilesChanged)}
							</span>
						</span>
					) : (
						<>
							<span className="min-w-0 whitespace-nowrap">
								Cached{' '}
								<span className="font-medium text-foreground tabular-nums">
									{formatCompactNumber(totalCachedTokens)}
								</span>
							</span>
							<span className="min-w-0 whitespace-nowrap">
								Reasoning{' '}
								<span className="font-medium text-foreground tabular-nums">
									{formatCompactNumber(totalReasoningTokens)}
								</span>
							</span>
						</>
					)}
				</div>
				{/* The right edge of a `justify-between` row. Once the legend beside it takes the
				    whole line this caption wraps below and the alignment has nothing left to sit
				    opposite: at 390 its two clauses ended 131px short of their own left edge.
				    Below `sm` it reads from the same rail as the legend above it. */}
				<div className="text-muted-foreground sm:text-right">
					{totalCaptured}/{totalRuns} runs with {metric === 'lines' ? 'line' : 'token'}{' '}
					data
					{metric === 'lines' && ` · ${runsWithFileData}/${totalRuns} with file counts`}
				</div>
			</div>
			<TelemetryChartTable
				caption={`${metric === 'lines' ? 'Line changes' : 'Token usage'} for each time bucket`}
				columns={tableColumns}
				rows={tableRows}
			/>
		</div>
	);
}
