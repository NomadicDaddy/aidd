import type {
	SystemMetricSnapshot,
	SystemMetricsResponse,
	WebVitalSummary,
} from '../../api/metrics.ts';

import { Metric } from '../../components/shared/Metric.tsx';
import { RelativeAge } from '../../components/shared/RelativeAge.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useSystemMetrics, useWebVitalsSummary } from '../../hooks/useMetrics.ts';
import { formatBytes } from '../../lib/formatters.ts';
import { toneText } from '../../lib/tones.ts';
import { WebVitalsPanel } from './SystemMetricsVitals.tsx';

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

function thresholdTone(
	value: null | number,
	warning: number,
	critical: number,
): 'amber' | 'emerald' | 'neutral' | 'red' {
	if (value === null || !Number.isFinite(value)) return 'neutral';
	if (value >= critical) return 'red';
	if (value >= warning) return 'amber';
	return 'emerald';
}

function getHeapIssue(heapUsed: null | number, heapTotal: null | number): null | string {
	if (
		heapUsed === null ||
		heapTotal === null ||
		!Number.isFinite(heapUsed) ||
		!Number.isFinite(heapTotal) ||
		heapUsed < 0 ||
		heapTotal < 0
	) {
		return 'Heap unavailable: this runtime did not provide comparable values.';
	}
	return heapUsed > heapTotal
		? 'Heap unavailable: used exceeds total in the same process sample.'
		: null;
}

function ResourcePanel({ current }: { current: SystemMetricSnapshot }) {
	const heapIssue = getHeapIssue(current.heapUsed, current.heapTotal);
	const heapValue = (value: null | number): string =>
		heapIssue ? 'Unavailable' : formatMetricBytes(value);

	return (
		<div className="grid grid-cols-2 gap-2 @min-[45rem]:grid-cols-3">
			{/* The shared tile, not a seventh private copy of it. The local `Stat` set its value at
			    14px where `Metric size="compact"` sets 18px, so the numbers on the app's own metrics
			    panel were smaller than the numbers on every dashboard tile. */}
			<Metric
				label="CPU"
				size="compact"
				tone={thresholdTone(current.cpuUsage, 85, 95)}
				value={formatPercent(current.cpuUsage)}
			/>
			<Metric
				label="Memory"
				size="compact"
				tone={thresholdTone(current.memoryUsage, 80, 90)}
				value={formatPercent(current.memoryUsage)}
			/>
			<Metric
				label="Disk"
				size="compact"
				tone={thresholdTone(current.diskUsage, 80, 90)}
				value={formatPercent(current.diskUsage)}
			/>
			<Metric
				label="Event loop"
				size="compact"
				tone={thresholdTone(current.eventLoopLatency, 50, 100)}
				value={formatMs(current.eventLoopLatency)}
			/>
			<Metric
				detail={heapIssue ? <span role="alert">{heapIssue}</span> : undefined}
				label="Heap used"
				size="compact"
				tone={heapIssue ? 'red' : 'neutral'}
				value={heapValue(current.heapUsed)}
			/>
			<Metric
				detail={heapIssue ? 'Same invalid process sample.' : undefined}
				label="Heap total"
				size="compact"
				tone={heapIssue ? 'red' : 'neutral'}
				value={heapValue(current.heapTotal)}
			/>
			<Metric label="RSS" size="compact" value={formatMetricBytes(current.rss)} />
			<Metric label="Connections" size="compact" value={String(current.activeConnections)} />
			<Metric
				label="Requests served"
				size="compact"
				value={current.requestCount.toLocaleString()}
			/>
		</div>
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
		<Card className="flex flex-col gap-4" variant="sunken">
			<CardHeader
				className="mb-0"
				description="Live process and host resource usage, sampled every minute. Updates every few seconds."
				status={
					metrics.data ? (
						<span className="text-xs text-muted-foreground">
							Sampled{' '}
							<RelativeAge
								value={new Date(metrics.data.current.timestamp).toISOString()}
							/>
						</span>
					) : undefined
				}
				title="System Metrics"
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
