import type { TelemetryOutputTimeseriesPoint } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import {
	formatCompactNumber,
	formatTelemetryAxisTick,
	formatTelemetryBucketLabel,
} from '../../lib/formatters.ts';
import { seriesSolid, seriesSolidHover } from '../../lib/series.ts';
import { ChartAxes } from './ChartAxes.tsx';
import { divergingTicks } from './chartAxisScale.ts';
import { TelemetryChartTable } from './TelemetryChartTable.tsx';

export type OutputMetric = 'lines' | 'tokens';

// Diverging bars from a shared center baseline: production (lines added / tokens in) grows up,
// the counterpart (lines removed / tokens out) grows down. Both arms share one symmetric scale
// so their magnitudes stay comparable — position carries the sign, color the identity. The two
// arms are series, not statuses, so they take categorical slots from `lib/series.ts`; the cyan /
// fuchsia pairing stays separable under red-green CVD and cannot be mistaken for the outcome
// colors used by the invocations chart.
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
	const max = Math.max(...points.map((point) => Math.max(upValue(point), downValue(point))), 1);
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
		bucket: formatTelemetryBucketLabel(bucket, point.bucket),
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
		<div aria-labelledby={chartHeadingId} className="space-y-2" role="group">
			<h3 className="sr-only" id={chartHeadingId}>
				{metric === 'lines' ? 'Line changes' : 'Token usage'} by time bucket
			</h3>
			{/* The 50% gridline is the shared center baseline the two arms diverge from, so the
			    chart no longer draws one of its own. */}
			<div aria-hidden="true">
				<ChartAxes
					categories={points.map((point) =>
						formatTelemetryAxisTick(bucket, point.bucket),
					)}
					ticks={divergingTicks(max)}>
					<div className="flex h-40 gap-1">
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
								<div
									className="group flex h-full flex-1 flex-col"
									key={point.bucket}
									title={tooltip}>
									<div className="flex flex-1 items-end">
										{up > 0 && (
											<div
												className={`w-full rounded-t-sm ${seriesSolid.slot1} ${seriesSolidHover.slot1}`}
												style={{
													height: `${Math.max(2, Math.round((up / max) * 100))}%`,
												}}
											/>
										)}
									</div>
									<div className="flex flex-1 items-start">
										{down > 0 && (
											<div
												className={`w-full rounded-b-sm ${seriesSolid.slot3} ${seriesSolidHover.slot3}`}
												style={{
													height: `${Math.max(2, Math.round((down / max) * 100))}%`,
												}}
											/>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</ChartAxes>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
				<div className="flex items-center gap-4">
					<span className="flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className={`h-2 w-2 rounded-full ${seriesSolid.slot1}`}
						/>
						{upLabel}{' '}
						<span className="font-medium text-foreground tabular-nums">
							{formatCompactNumber(totalUp)}
						</span>
					</span>
					<span className="flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className={`h-2 w-2 rounded-full ${seriesSolid.slot3}`}
						/>
						{downLabel}{' '}
						<span className="font-medium text-foreground tabular-nums">
							{formatCompactNumber(totalDown)}
						</span>
					</span>
					{metric === 'lines' ? (
						<span>
							Files changed{' '}
							<span className="font-medium text-foreground tabular-nums">
								{formatCompactNumber(totalFilesChanged)}
							</span>
						</span>
					) : (
						<>
							<span>
								Cached{' '}
								<span className="font-medium text-foreground tabular-nums">
									{formatCompactNumber(totalCachedTokens)}
								</span>
							</span>
							<span>
								Reasoning{' '}
								<span className="font-medium text-foreground tabular-nums">
									{formatCompactNumber(totalReasoningTokens)}
								</span>
							</span>
						</>
					)}
				</div>
				<div className="text-right text-muted-foreground">
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
