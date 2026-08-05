import type {
	SystemMetricSnapshot,
	SystemMetricsResponse,
	WebVitalSummary,
} from '../../api/metrics.ts';
import type { Tone } from '../../lib/tones.ts';

import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useSystemMetrics, useWebVitalsSummary } from '../../hooks/useMetrics.ts';
import { formatBytes } from '../../lib/formatters.ts';
import { fieldLabelClass } from '../../lib/formStyles.ts';
import { toneSolid, toneText } from '../../lib/tones.ts';

function formatMetricBytes(bytes: null | number): string {
	if (bytes === null || !Number.isFinite(bytes)) return '—';
	return formatBytes(bytes);
}

function formatPercent(value: null | number): string {
	return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`;
}

function formatMs(value: null | number): string {
	return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)} ms`;
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<Card className="px-3 py-2" variant="sunken">
			<div className={fieldLabelClass}>{label}</div>
			<div className="mt-0.5 text-sm font-medium text-foreground tabular-nums">{value}</div>
		</Card>
	);
}

const ratingTone: Record<string, Tone> = {
	good: 'emerald',
	'needs-improvement': 'amber',
	poor: 'red',
};

/** Colour belongs on a status element, not on the metric's own name. */
function RatingDot({ rating }: { rating: null | string }) {
	const tone = (rating && ratingTone[rating]) || 'neutral';
	return (
		<>
			<span
				aria-hidden="true"
				className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${toneSolid[tone]}`}
			/>
			<span className="sr-only">{rating ?? 'no rating'}: </span>
		</>
	);
}

function ResourcePanel({ current }: { current: SystemMetricSnapshot }) {
	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
			<Stat label="CPU" value={formatPercent(current.cpuUsage)} />
			<Stat label="Memory" value={formatPercent(current.memoryUsage)} />
			<Stat label="Disk" value={formatPercent(current.diskUsage)} />
			<Stat label="Event loop" value={formatMs(current.eventLoopLatency)} />
			<Stat label="Heap used" value={formatMetricBytes(current.heapUsed)} />
			<Stat label="Heap total" value={formatMetricBytes(current.heapTotal)} />
			<Stat label="RSS" value={formatMetricBytes(current.rss)} />
			<Stat label="Connections" value={String(current.activeConnections)} />
			<Stat label="Requests served" value={current.requestCount.toLocaleString()} />
		</div>
	);
}

function WebVitalsPanel({ vitals }: { vitals: WebVitalSummary[] }) {
	const hasSamples = vitals.some((vital) => vital.sampleCount > 0);
	if (!hasSamples) {
		return (
			<p className="text-xs text-muted-foreground">
				No Core Web Vitals recorded yet. Vitals are reported by the browser as you navigate
				the panel.
			</p>
		);
	}
	return (
		<table className="w-full text-sm">
			<thead>
				<tr className="text-left text-xs text-muted-foreground">
					<th className="py-1 font-medium">Metric</th>
					<th className="py-1 text-right font-medium">Latest</th>
					<th className="py-1 text-right font-medium">Average</th>
					<th className="py-1 text-right font-medium">Threshold</th>
					<th className="py-1 text-right font-medium">Samples</th>
				</tr>
			</thead>
			<tbody>
				{vitals.map((vital) => (
					<tr className="border-t border-border" key={vital.name}>
						<td className="py-1 font-medium text-foreground">
							<RatingDot rating={vital.latestRating} />
							{vital.name}
						</td>
						<td className="py-1 text-right tabular-nums">
							{vital.latest === null ? '—' : vital.latest.toLocaleString()}
						</td>
						<td className="py-1 text-right tabular-nums">
							{/* Raw averages arrived at arbitrary precision — 338.638 beside 49,772. */}
							{vital.sampleCount > 0
								? vital.average.toLocaleString(undefined, {
										maximumFractionDigits: 1,
										minimumFractionDigits: 1,
									})
								: '—'}
						</td>
						<td className="py-1 text-right text-muted-foreground tabular-nums">
							{vital.threshold.toLocaleString()}
						</td>
						<td className="py-1 text-right text-muted-foreground tabular-nums">
							{vital.sampleCount}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

interface MetricsPanelState<T> {
	data: T | undefined;
	isError: boolean;
}

interface SystemMetricsContentProps {
	metrics: MetricsPanelState<SystemMetricsResponse>;
	vitals: MetricsPanelState<WebVitalSummary[]>;
}

export function SystemMetricsContent({ metrics, vitals }: SystemMetricsContentProps) {
	return (
		<Card className="space-y-4">
			<CardHeader
				className="mb-0"
				description="Live process and host resource usage, sampled every minute. Updates every few seconds."
				title="System metrics"
			/>
			{metrics.isError ? (
				<p className={`text-xs ${toneText.red}`} role="alert">
					Could not load system metrics.
				</p>
			) : metrics.data ? (
				<ResourcePanel current={metrics.data.current} />
			) : (
				<p aria-live="polite" className="text-xs text-muted-foreground" role="status">
					Loading metrics…
				</p>
			)}

			<div className="border-t border-border pt-4">
				<CardHeader
					description="Frontend performance over the last 6 hours, rated against Google's thresholds."
					headingLevel={3}
					level="subsection"
					title="Core Web Vitals"
				/>
				{vitals.isError ? (
					<p className={`text-xs ${toneText.red}`} role="alert">
						Could not load web vitals.
					</p>
				) : vitals.data ? (
					<WebVitalsPanel vitals={vitals.data} />
				) : (
					<p aria-live="polite" className="text-xs text-muted-foreground" role="status">
						Loading vitals…
					</p>
				)}
			</div>
		</Card>
	);
}

export function SystemMetricsSection() {
	const metrics = useSystemMetrics();
	const vitals = useWebVitalsSummary();

	return <SystemMetricsContent metrics={metrics} vitals={vitals} />;
}
