import { Metric } from '../../components/shared/Metric.tsx';
import { outcomeSolid, seriesSolid } from '../../lib/series.ts';

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
 * It is a series slot, not a tone: these colours are shared with the chart bars and the legend
 * below, where "emerald means healthy" would be a claim nobody made. `Metric`'s `marker` slot takes
 * it as a node for exactly this reason — so a categorical colour cannot be smuggled in as a tone.
 */
function seriesDot(className: string) {
	return <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

export function TelemetrySummary({ totals }: { totals: TelemetryTotals }) {
	return (
		<section aria-label="Invocation summary" className="space-y-3">
			{/* Shape-of-work breakdown: categorical, so it uses series slots rather than tones. */}
			<div className="grid gap-3 sm:grid-cols-3">
				<Metric
					label="Total invocations"
					marker={seriesDot(seriesSolid.slot1)}
					value={totals.total}
				/>
				<Metric
					label="Top-level actions"
					marker={seriesDot(seriesSolid.slot2)}
					value={totals.topLevel}
				/>
				<Metric
					label="Nested steps"
					marker={seriesDot(seriesSolid.slot3)}
					value={totals.nested}
				/>
			</div>
			{/* Outcome breakdown: shares the outcome ramp with the chart bars and legend below. The
			    `md` step is what keeps eight tiles to two rows at tablet width — without it the
			    grid held two columns until `lg` and the outcome row alone filled the viewport.
			    These are `compact`: eight tiles at the headline step would out-shout the three
			    figures above them, which are what the page is actually reporting. */}
			<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
				<Metric
					label="Completed"
					marker={seriesDot(outcomeSolid.completed)}
					size="compact"
					value={totals.completed}
				/>
				<Metric
					label="Warnings"
					marker={seriesDot(outcomeSolid.warnings)}
					size="compact"
					value={totals.warnings}
				/>
				<Metric
					label="Failed"
					marker={seriesDot(outcomeSolid.failed)}
					size="compact"
					value={totals.failed}
				/>
				<Metric
					label="Flagged"
					marker={seriesDot(outcomeSolid.flagged)}
					size="compact"
					value={totals.flagged}
				/>
				<Metric
					label="Stopped"
					marker={seriesDot(outcomeSolid.stopped)}
					size="compact"
					value={totals.stopped}
				/>
				<Metric
					label="Killed"
					marker={seriesDot(outcomeSolid.killed)}
					size="compact"
					value={totals.killed}
				/>
				<Metric
					label="No work"
					marker={seriesDot(outcomeSolid.noWork)}
					size="compact"
					value={totals.noWork}
				/>
				<Metric
					label="Running"
					marker={seriesDot(outcomeSolid.running)}
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
