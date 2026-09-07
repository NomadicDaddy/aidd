import type { WebVitalSummary } from '../../api/metrics.ts';
import type { Tone } from '../../lib/tones.ts';

import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { tableHeadClass } from '../../lib/tableStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { proseMeasureClass } from '../../lib/typography.ts';

const ratingTone: Record<string, Tone> = {
	good: 'emerald',
	'needs-improvement': 'amber',
	poor: 'red',
};

const ratingLabel: Record<string, string> = {
	good: 'Good',
	'needs-improvement': 'Needs improvement',
	poor: 'Poor',
};

const millisecondVitalNames = new Set(['FCP', 'INP', 'LCP', 'TTFB']);

function RatingBadge({ rating }: { rating: null | string }) {
	if (!rating) return <span className="text-muted-foreground">—</span>;
	return (
		<Badge showDot tone={ratingTone[rating] ?? 'neutral'}>
			{ratingLabel[rating] ?? rating}
		</Badge>
	);
}

// Core Web Vitals are defined as a p75 contract, so the panel grades the p75 sample rather than the
// mean: an average passes whenever enough fast loads outnumber the slow ones, which is exactly the
// case an operator needs to see. A null p75 means no samples, not a compliant zero.
function p75Tone(vital: WebVitalSummary): Tone {
	if (vital.p75 === null) return 'neutral';
	return vital.p75 <= vital.threshold ? 'emerald' : 'red';
}

function P75Badge({ vital }: { vital: WebVitalSummary }) {
	if (vital.p75 === null) return <span className="text-muted-foreground">—</span>;
	const withinThreshold = vital.p75 <= vital.threshold;
	if (withinThreshold) return <span className="sr-only">P75 within threshold</span>;
	return (
		<Badge showDot tone="red">
			P75 above threshold
		</Badge>
	);
}

function formatVitalReading(vital: WebVitalSummary, value: number): string {
	const fractionDigits = millisecondVitalNames.has(vital.name) ? 1 : 3;
	const reading = value.toLocaleString(undefined, {
		maximumFractionDigits: fractionDigits,
		minimumFractionDigits: fractionDigits,
	});
	return millisecondVitalNames.has(vital.name) ? `${reading} ms` : reading;
}

function vitalP75(vital: WebVitalSummary): string {
	if (vital.p75 === null) return '—';
	return formatVitalReading(vital, vital.p75);
}

function VitalCard({ vital }: { vital: WebVitalSummary }) {
	const fields: [string, string, null | Tone][] = [
		['Latest', vital.latest === null ? '—' : formatVitalReading(vital, vital.latest), null],
		['P75', vitalP75(vital), p75Tone(vital)],
		['Threshold', formatVitalReading(vital, vital.threshold), null],
		['Samples', String(vital.sampleCount), null],
	];
	return (
		<div className="flex flex-col gap-1.5 py-2.5" role="listitem">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="text-sm font-medium text-foreground">{vital.name}</span>
				<div className="flex flex-wrap items-center justify-end gap-1.5">
					<span className="sr-only">Latest sample rating:</span>
					<RatingBadge rating={vital.latestRating} />
					<span className="sr-only">P75 status:</span>
					<P75Badge vital={vital} />
				</div>
			</div>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
				{fields.map(([label, value, tone]) => (
					<div className="flex items-baseline justify-between gap-2" key={label}>
						<dt className="text-muted-foreground">{label}</dt>
						<dd
							className={
								tone
									? `${toneText[tone]} tabular-nums`
									: 'text-foreground tabular-nums'
							}>
							{value}
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

export function WebVitalsPanel({ vitals }: { vitals: WebVitalSummary[] }) {
	if (!vitals.some((vital) => vital.sampleCount > 0)) {
		return (
			<p className={`text-xs text-muted-foreground ${proseMeasureClass}`}>
				No Core Web Vitals recorded yet. Vitals are reported by the browser as you navigate
				the panel.
			</p>
		);
	}
	return (
		<>
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
			<p className={`mt-2 text-xs text-muted-foreground ${proseMeasureClass}`}>
				Latest rating describes the newest sample; P75 is the nearest-rank 75th percentile
				of the last 6 hours, taken over the sample count shown.
			</p>
		</>
	);
}

function VitalsTable({ vitals }: { vitals: WebVitalSummary[] }) {
	return (
		<table className="w-full min-w-[48rem] table-fixed text-sm">
			<colgroup>
				<col className="w-20" />
				<col className="w-40" />
				<col className="w-28" />
				<col className="w-52" />
				<col className="w-28" />
				<col className="w-20" />
			</colgroup>
			<thead className={tableHeadClass}>
				<tr className="text-left">
					<th className="px-2 py-1.5">Metric</th>
					<th className="px-2 py-1.5">Latest sample rating</th>
					<th className="px-2 py-1.5 text-right">Latest</th>
					<th className="px-2 py-1.5 text-right">P75 & status</th>
					<th className="px-2 py-1.5 text-right">Threshold</th>
					<th className="px-2 py-1.5 text-right">Samples</th>
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
							{vital.latest === null ? '—' : formatVitalReading(vital, vital.latest)}
						</td>
						<td className="px-2 py-1 text-right">
							<div className="flex flex-wrap items-center justify-end gap-1.5">
								<span className={`tabular-nums ${toneText[p75Tone(vital)]}`}>
									{vitalP75(vital)}
								</span>
								<P75Badge vital={vital} />
							</div>
						</td>
						<td className="px-2 py-1 text-right text-muted-foreground tabular-nums">
							{formatVitalReading(vital, vital.threshold)}
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
