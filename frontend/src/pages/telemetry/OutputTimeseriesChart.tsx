import type { TelemetryOutputTimeseriesPoint } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { formatCompactNumber } from '../../lib/formatters.ts';

export type OutputMetric = 'lines' | 'tokens';

function bucketLabel(bucket: 'day' | 'hour', timestamp: number): string {
	const label = new Date(timestamp);
	return bucket === 'hour'
		? `${label.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${label.getHours()}:00`
		: label.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Diverging bars from a shared center baseline: production (lines added / tokens in) grows up,
// the counterpart (lines removed / tokens out) grows down. Both arms share one symmetric scale
// so their magnitudes stay comparable — position carries the sign, color the identity (cyan up,
// orange down: a warm/cool pair that stays distinct under CVD and never impersonates the
// emerald/red outcome colors used by the invocations chart).
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
	return (
		<div className="space-y-2">
			<div className="relative">
				<div
					aria-hidden="true"
					className="absolute inset-x-0 top-1/2 h-px bg-neutral-200 dark:bg-neutral-800"
				/>
				<div className="flex h-40 gap-1">
					{points.map((point) => {
						const up = upValue(point);
						const down = downValue(point);
						const captured = capturedRuns(point);
						const tooltip = [
							bucketLabel(bucket, point.bucket),
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
											className="w-full rounded-t-sm bg-teal-600 group-hover:bg-teal-500"
											style={{
												height: `${Math.max(2, Math.round((up / max) * 100))}%`,
											}}
										/>
									)}
								</div>
								<div className="flex flex-1 items-start">
									{down > 0 && (
										<div
											className="w-full rounded-b-sm bg-orange-600 group-hover:bg-orange-500"
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
			</div>
			<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600 dark:text-neutral-400">
				<div className="flex items-center gap-4">
					<span className="flex items-center gap-1.5">
						<span aria-hidden="true" className="h-2 w-2 rounded-full bg-teal-600" />
						{upLabel}{' '}
						<span className="font-medium text-neutral-950 tabular-nums dark:text-neutral-50">
							{formatCompactNumber(totalUp)}
						</span>
					</span>
					<span className="flex items-center gap-1.5">
						<span aria-hidden="true" className="h-2 w-2 rounded-full bg-orange-600" />
						{downLabel}{' '}
						<span className="font-medium text-neutral-950 tabular-nums dark:text-neutral-50">
							{formatCompactNumber(totalDown)}
						</span>
					</span>
					{metric === 'lines' ? (
						<span>
							Files changed{' '}
							<span className="font-medium text-neutral-950 tabular-nums dark:text-neutral-50">
								{formatCompactNumber(totalFilesChanged)}
							</span>
						</span>
					) : (
						<>
							<span>
								Cached{' '}
								<span className="font-medium text-neutral-950 tabular-nums dark:text-neutral-50">
									{formatCompactNumber(totalCachedTokens)}
								</span>
							</span>
							<span>
								Reasoning{' '}
								<span className="font-medium text-neutral-950 tabular-nums dark:text-neutral-50">
									{formatCompactNumber(totalReasoningTokens)}
								</span>
							</span>
						</>
					)}
				</div>
				<div className="text-right text-neutral-500">
					{totalCaptured}/{totalRuns} runs with {metric === 'lines' ? 'line' : 'token'}{' '}
					data
					{metric === 'lines' && ` · ${runsWithFileData}/${totalRuns} with file counts`}
				</div>
			</div>
		</div>
	);
}
