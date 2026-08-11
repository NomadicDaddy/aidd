import type { TelemetryOutputTimeseriesPoint } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import {
	formatCompactNumber,
	formatTelemetryAxisTick,
	formatTelemetryBucketLabel,
} from '../../lib/formatters.ts';
import { seriesSolid, seriesSolidHover } from '../../lib/series.ts';
import { ChartAxes } from './ChartAxes.tsx';
import { divergingTicks, niceAxisMax } from './chartAxisScale.ts';
import { TelemetryChartTable } from './TelemetryChartTable.tsx';

export type OutputMetric = 'lines' | 'tokens';

/**
 * One half of the diverging plot, named with the domain it is drawn against.
 *
 * `pl-12` is the axis gutter — `w-10` plus the `gap-x-2` beside it — so the caption starts where the
 * plot starts rather than where the tick labels do.
 */
function ScaleCaption({
	domain,
	dotClass,
	label,
}: {
	domain: number;
	dotClass: string;
	label: string;
}) {
	return (
		<div className="flex items-center gap-1.5 pl-12 text-xs text-muted-foreground">
			<span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotClass}`} />
			{label} · this half scales to{' '}
			<span className="font-medium text-foreground tabular-nums">
				{formatCompactNumber(domain)}
			</span>
		</div>
	);
}

// Diverging bars from a shared center baseline: production (lines added / tokens in) grows up,
// the counterpart (lines removed / tokens out) grows down. Position carries the sign, color the
// identity, and each arm carries its own scale — stated in its caption, because a break the reader
// cannot see is worse than no break at all. The two arms are series, not statuses, so they take
// categorical slots from `lib/series.ts`; the cyan / fuchsia pairing stays separable under
// red-green CVD and cannot be mistaken for the outcome colors used by the invocations chart.
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
	// One domain per arm. Sharing a single symmetric scale anchored on the larger arm emptied the
	// whole lower half of the token chart — with 352.9M in against 1.5M out, every downward bar
	// collapsed to its 2px minimum. Each arm is labelled with its own domain on the axis.
	const maxUp = niceAxisMax(Math.max(...points.map(upValue), 1));
	const maxDown = niceAxisMax(Math.max(...points.map(downValue), 1));
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
			    chart no longer draws one of its own.

			    Each half states the domain it is drawn against, above and below the plot. The two
			    arms have identical pixel heights and one continuous gutter, so the geometry reads as
			    a single scale — with 2.3B in against 12M out the two blocks came out comparable in
			    length and the default reading was wrong by two orders of magnitude. The axis carried
			    both numbers already; nothing said they were two domains. The caption is text, so the
			    distinction does not rest on telling cyan from fuchsia. */}
			<div aria-hidden="true" className="space-y-1">
				<ScaleCaption domain={maxUp} dotClass={seriesSolid.slot1} label={upLabel} />
				<ChartAxes
					categories={points.map((point) =>
						formatTelemetryAxisTick(bucket, point.bucket),
					)}
					ticks={divergingTicks(maxUp, maxDown)}>
					{/* Shorter than the single-sided chart: the two arms split this height evenly, and the
					    smaller arm is routinely a fifth of its half, so `h-40` left a persistent empty
					    band between the bars and the legend. */}
					<div className="relative flex h-32 gap-1">
						{/* The break itself. A dashed rule is the conventional mark for a scale
						    discontinuity, and it is the one line on this plot that is not a
						    gridline — above it and below it are different scales. */}
						<span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-muted-foreground/50" />
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
													height: `${Math.max(2, Math.round((up / maxUp) * 100))}%`,
												}}
											/>
										)}
									</div>
									<div className="flex flex-1 items-start">
										{down > 0 && (
											<div
												className={`w-full rounded-b-sm ${seriesSolid.slot3} ${seriesSolidHover.slot3}`}
												style={{
													height: `${Math.max(2, Math.round((down / maxDown) * 100))}%`,
												}}
											/>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</ChartAxes>
				<ScaleCaption domain={maxDown} dotClass={seriesSolid.slot3} label={downLabel} />
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
