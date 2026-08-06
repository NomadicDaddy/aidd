import { Metric } from '../../components/shared/Metric.tsx';
import { outcomeSolid } from '../../lib/series.ts';

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

export function TelemetrySummary({ totals }: { totals: TelemetryTotals }) {
	return (
		<section aria-label="Invocation summary" className="space-y-3">
			{/* Shape-of-work breakdown, and the one place on this page a dot would decode to
			    nothing: these three quantities are not a series in any chart here, so the cyan,
			    indigo and magenta they carried appeared in no legend and stood for nothing a
			    reader could look up. The outcome tiles below keep theirs — those colours are the
			    chart's, and the chart legend states them. */}
			<div className="grid gap-3 sm:grid-cols-3">
				<Metric label="Total invocations" value={totals.total} />
				<Metric label="Top-level actions" value={totals.topLevel} />
				<Metric label="Nested steps" value={totals.nested} />
			</div>
			{/* Outcome breakdown: shares the outcome ramp with the chart bars and legend below. The
			    `md` step is what keeps eight tiles to two rows at tablet width — without it the
			    grid held two columns until `lg` and the outcome row alone filled the viewport.
			    These are `compact`: eight tiles at the headline step would out-shout the three
			    figures above them, which are what the page is actually reporting. */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
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
