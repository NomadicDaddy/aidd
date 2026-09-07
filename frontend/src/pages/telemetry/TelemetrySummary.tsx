import {
	type TelemetryOutcomeBucket,
	telemetryOutcomeOrder,
	telemetryOutcomePresentation,
} from 'aidd-shared/runs/outcome';
import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as GitBranch } from 'lucide-react/dist/esm/icons/git-branch';
import { default as Play } from 'lucide-react/dist/esm/icons/play';

import type { TelemetryTotals } from './telemetryTotals.ts';

import { Metric } from '../../components/shared/Metric.tsx';
import { partitionPercentages } from '../../lib/formatters.ts';
import { outcomePattern, outcomeSolid } from '../../lib/series.ts';

/**
 * The active time window, said the way the tiles need to say it.
 *
 * The filter reads '24h'; a tile cannot, because the tile is a sentence about what the number
 * counts and '24h' is a control label. Falls through to the all-time phrasing, which is also the
 * default window.
 */
const windowPhrases: Record<string, string> = {
	'24h': 'in the last 24 hours',
	'30d': 'in the last 30 days',
	'7d': 'in the last 7 days',
};

/**
 * The categorical swatch beside a summary count.
 *
 * It is a series slot, not a tone: these colours are the chart's own, stated by the legend under
 * it, where "emerald means healthy" would be a claim nobody made. `Metric`'s `marker` slot takes it
 * as a node for exactly this reason — so a categorical colour cannot be smuggled in as a tone. It
 * is only ever given to a tile whose colour the legend below actually names.
 */
function outcomeDot(className: string) {
	return <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

function OutcomeMetric({
	active,
	label,
	marker,
	onSelect,
	outcome,
	value,
}: {
	active: boolean;
	label: string;
	marker: string;
	onSelect: (outcome: TelemetryOutcomeBucket) => void;
	outcome: TelemetryOutcomeBucket;
	value: number;
}) {
	return (
		<button
			aria-pressed={active}
			className={`h-full min-h-11 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${active ? 'ring-2 ring-accent/50' : ''}`}
			onClick={() => onSelect(outcome)}
			type="button">
			<Metric
				interactive
				label={label}
				marker={outcomeDot(marker)}
				size="compact"
				surface="panel"
				value={value}
			/>
		</button>
	);
}

export function TelemetrySummary({
	activeOutcome,
	onOutcomeChange,
	totals,
	windowLabel,
}: {
	activeOutcome: null | TelemetryOutcomeBucket;
	onOutcomeChange: (outcome: TelemetryOutcomeBucket) => void;
	totals: TelemetryTotals;
	windowLabel: string;
}) {
	const window = windowPhrases[windowLabel] ?? 'across all recorded time';
	const [topLevelPercent = 0, nestedPercent = 0] = partitionPercentages(
		[totals.topLevel, totals.nested],
		totals.total,
	);
	return (
		<section aria-label="Invocation summary" className="@container space-y-3">
			{/* Shape-of-work breakdown, and the one place on this page a dot would decode to
			    nothing: these three quantities are not a series in any chart here, so the cyan,
			    indigo and magenta they carried appeared in no legend and stood for nothing a
			    reader could look up. The outcome tiles below keep theirs — those colours are the
			    chart's, and the chart legend states them.

			    A label and a bare integer is all these three had, and it left two questions the
			    reader had to answer from elsewhere on the page. The first is what span the number
			    covers: the window lives in a control two cards up, so '38' beside 'Total
			    invocations' was 38 of something the tile did not name. The second is how the split
			    divides — Top-level and Nested sum to the total, which is a relationship worth one
			    figure rather than one the reader recomputes. The icons are the Dashboard's Metric
			    idiom and only distinguish the three at a glance; they carry no meaning the text
			    does not. */}
			{/* Measured on this section, not the viewport: 358px inside a 390px viewport, 328px
			    inside a 360px one. The first step goes below both so the three figures read the
			    same way on either handset; see DashboardMetrics.tsx for why 20rem and not lower. */}
			<div className="grid gap-3 @min-[20rem]:grid-cols-2 @min-[32rem]:grid-cols-3">
				<Metric
					compactOnMobile
					detail={window}
					icon={<Activity className="h-5 w-5" />}
					label="Total invocations"
					value={totals.total}
				/>
				<Metric
					compactOnMobile
					detail={`${topLevelPercent}% of invocations`}
					icon={<Play className="h-5 w-5" />}
					label="Top-level actions"
					value={totals.topLevel}
				/>
				<Metric
					className="@min-[20rem]:col-span-2 @min-[32rem]:col-span-1"
					compactOnMobile
					detail={`${nestedPercent}% of invocations`}
					icon={<GitBranch className="h-5 w-5" />}
					label="Nested steps"
					value={totals.nested}
				/>
			</div>
			{/* Outcome breakdown: shares the outcome ramp with the chart bars and legend below. The
			    middle step is what keeps eight tiles to two rows at tablet width — without it the
			    grid held two columns until the widest step and the outcome row alone filled the
			    viewport. The steps read this section's own width, not the viewport's; see the
			    content-width table in AppLayout.tsx for why those differ. These are `compact`:
			    eight tiles at the headline step would out-shout the three figures above them,
			    which are what the page is actually reporting. */}
			<div className="grid gap-3 @min-[20rem]:grid-cols-2 @min-[45rem]:grid-cols-4 @min-[61rem]:grid-cols-8">
				{telemetryOutcomeOrder.map((outcome) => (
					<OutcomeMetric
						active={activeOutcome === outcome}
						key={outcome}
						label={telemetryOutcomePresentation[outcome].label}
						marker={`${outcomeSolid[outcome]} ${outcomePattern[outcome]}`}
						onSelect={onOutcomeChange}
						outcome={outcome}
						value={totals[outcome]}
					/>
				))}
			</div>
			<p className="max-w-3xl rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
				Every top-level launch and every nested recipe or skill step is one invocation. Each
				invocation appears in exactly one outcome above.
			</p>
		</section>
	);
}
