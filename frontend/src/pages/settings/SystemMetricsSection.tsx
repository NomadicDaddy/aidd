import type {
	SystemMetricSnapshot,
	SystemMetricsResponse,
	WebVitalSummary,
} from '../../api/metrics.ts';
import type { Tone } from '../../lib/tones.ts';

import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useSystemMetrics, useWebVitalsSummary } from '../../hooks/useMetrics.ts';
import { formatBytes } from '../../lib/formatters.ts';
import { fieldLabelClass } from '../../lib/formStyles.ts';
import { tableHeadClass } from '../../lib/tableStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { proseMeasureClass } from '../../lib/typography.ts';

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

/**
 * The rating, as a word.
 *
 * It was a bare 6px dot in front of the metric name, with no adjacent word and no legend anywhere
 * on the surface — so `good`, `needs-improvement` and `poor` were legible only as hue, to a reader
 * who already knew the scale. The screen-reader text was correct and carried the word; sighted
 * readers were the ones getting less. The house Badge keeps the dot and adds the word to it.
 */
function RatingBadge({ rating }: { rating: null | string }) {
	if (!rating) return <span className="text-muted-foreground">—</span>;
	return (
		<Badge showDot tone={ratingTone[rating] ?? 'neutral'}>
			{rating}
		</Badge>
	);
}

function ResourcePanel({ current }: { current: SystemMetricSnapshot }) {
	return (
		<div className="grid grid-cols-2 gap-2 @min-[32rem]:grid-cols-4">
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
			<p className={`text-xs text-muted-foreground ${proseMeasureClass}`}>
				No Core Web Vitals recorded yet. Vitals are reported by the browser as you navigate
				the panel.
			</p>
		);
	}
	return (
		<>
			{/* The pattern the Backend Matrix two tabs over already uses, which this table did not:
			    a gated scroller and a stack that replaces it. Six columns measured 462px against a
			    358px content column and there was no wrapper at all, so the overflow was the page's
			    and /settings scrolled sideways. Gated at `lg` rather than `xl` because that is where
			    this particular table fits — 462px into the 736px column an expanded rail leaves at
			    1024 — and cards for a table that fits would be its own defect. */}
			<OverflowScroller ariaLabel="Core Web Vitals" className="hidden @min-[45rem]:block">
				<VitalsTable vitals={vitals} />
			</OverflowScroller>
			<div
				aria-label="Core Web Vitals"
				className="divide-y divide-border @min-[45rem]:hidden"
				role="list">
				{vitals.map((vital) => (
					<VitalCard key={vital.name} vital={vital} />
				))}
			</div>
		</>
	);
}

/** One decimal place, always: raw averages arrived at arbitrary precision — 338.638 beside 49,772. */
function vitalAverage(vital: WebVitalSummary): string {
	if (vital.sampleCount === 0) return '—';
	return vital.average.toLocaleString(undefined, {
		maximumFractionDigits: 1,
		minimumFractionDigits: 1,
	});
}

function VitalCard({ vital }: { vital: WebVitalSummary }) {
	const fields: [string, string][] = [
		['Latest', vital.latest === null ? '—' : vital.latest.toLocaleString()],
		['Average', vitalAverage(vital)],
		['Threshold', vital.threshold.toLocaleString()],
		['Samples', String(vital.sampleCount)],
	];
	return (
		<div className="flex flex-col gap-1.5 py-2.5" role="listitem">
			<div className="flex items-center justify-between gap-2">
				<span className="text-sm font-medium text-foreground">{vital.name}</span>
				<RatingBadge rating={vital.latestRating} />
			</div>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
				{fields.map(([label, value]) => (
					<div className="flex items-baseline justify-between gap-2" key={label}>
						<dt className="text-muted-foreground">{label}</dt>
						<dd className="text-foreground tabular-nums">{value}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

function VitalsTable({ vitals }: { vitals: WebVitalSummary[] }) {
	return (
		<table className="w-full text-sm">
			{/* The same header strip the Backend Matrix uses: this table styled its own with a
			    different case, weight and background, two cards apart on one surface. */}
			<thead className={tableHeadClass}>
				<tr className="text-left">
					<th className={`px-2 py-1.5 ${fieldLabelClass}`}>Metric</th>
					<th className={`px-2 py-1.5 ${fieldLabelClass}`}>Rating</th>
					<th className={`px-2 py-1.5 text-right ${fieldLabelClass}`}>Latest</th>
					<th className={`px-2 py-1.5 text-right ${fieldLabelClass}`}>Average</th>
					<th className={`px-2 py-1.5 text-right ${fieldLabelClass}`}>Threshold</th>
					<th className={`px-2 py-1.5 text-right ${fieldLabelClass}`}>Samples</th>
				</tr>
			</thead>
			<tbody>
				{vitals.map((vital) => (
					<tr className="border-t border-border" key={vital.name}>
						<td className="px-2 py-1 font-medium text-foreground">{vital.name}</td>
						<td className="px-2 py-1">
							<RatingBadge rating={vital.latestRating} />
						</td>
						<td className="px-2 py-1 text-right tabular-nums">
							{vital.latest === null ? '—' : vital.latest.toLocaleString()}
						</td>
						<td className="px-2 py-1 text-right tabular-nums">{vitalAverage(vital)}</td>
						<td className="px-2 py-1 text-right text-muted-foreground tabular-nums">
							{vital.threshold.toLocaleString()}
						</td>
						<td className="px-2 py-1 text-right text-muted-foreground tabular-nums">
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
		<Card className="flex flex-col gap-4">
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
