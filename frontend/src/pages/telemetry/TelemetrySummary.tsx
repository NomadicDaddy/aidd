import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as GitBranch } from 'lucide-react/dist/esm/icons/git-branch';
import { default as Play } from 'lucide-react/dist/esm/icons/play';

import { Metric } from '../../components/shared/Metric.tsx';
import { percent } from '../../lib/formatters.ts';
import { outcomeSolid } from '../../lib/series.ts';

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

export interface TelemetryTotals {
	completed: number;
	failed: number;
	flagged: number;
	killed: number;
	nested: number;
	noWork: number;
	running: number;
	stopped: number;
	topLevel: number;
	total: number;
	warnings: number;
}

/**
 * The categorical swatch that used to be `CountCard`'s reason to exist.
 *
 * It is a series slot, not a tone: these colours are the chart's own, stated by the legend under
 * it, where "emerald means healthy" would be a claim nobody made. `Metric`'s `marker` slot takes it
 * as a node for exactly this reason — so a categorical colour cannot be smuggled in as a tone. It
 * is only ever given to a tile whose colour the legend below actually names.
 */
function outcomeDot(className: string) {
	return <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

export function TelemetrySummary({
	totals,
	windowLabel,
}: {
	totals: TelemetryTotals;
	windowLabel: string;
}) {
	const window = windowPhrases[windowLabel] ?? 'across all recorded time';
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
			<div className="grid gap-3 @min-[32rem]:grid-cols-3">
				<Metric
					detail={window}
					icon={<Activity className="h-5 w-5" />}
					label="Total invocations"
					value={totals.total}
				/>
				<Metric
					detail={`${percent(totals.topLevel, totals.total)}% of invocations`}
					icon={<Play className="h-5 w-5" />}
					label="Top-level actions"
					value={totals.topLevel}
				/>
				<Metric
					detail={`${percent(totals.nested, totals.total)}% of invocations`}
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
			<div className="grid gap-3 @min-[32rem]:grid-cols-2 @min-[45rem]:grid-cols-4 @min-[61rem]:grid-cols-8">
				<Metric
					label="Completed"
					marker={outcomeDot(outcomeSolid.completed)}
					size="compact"
					value={totals.completed}
				/>
				<Metric
					label="Warnings"
					marker={outcomeDot(outcomeSolid.warnings)}
					size="compact"
					value={totals.warnings}
				/>
				<Metric
					label="Failed"
					marker={outcomeDot(outcomeSolid.failed)}
					size="compact"
					value={totals.failed}
				/>
				<Metric
					label="Flagged"
					marker={outcomeDot(outcomeSolid.flagged)}
					size="compact"
					value={totals.flagged}
				/>
				<Metric
					label="Stopped"
					marker={outcomeDot(outcomeSolid.stopped)}
					size="compact"
					value={totals.stopped}
				/>
				<Metric
					label="Killed"
					marker={outcomeDot(outcomeSolid.killed)}
					size="compact"
					value={totals.killed}
				/>
				<Metric
					label="No work"
					marker={outcomeDot(outcomeSolid.noWork)}
					size="compact"
					value={totals.noWork}
				/>
				<Metric
					label="Running"
					marker={outcomeDot(outcomeSolid.running)}
					size="compact"
					value={totals.running}
				/>
			</div>
			<p className="text-xs text-muted-foreground">
				Every top-level launch and every nested recipe or skill step is one invocation. Each
				invocation appears in exactly one outcome above.
			</p>
		</section>
	);
}
