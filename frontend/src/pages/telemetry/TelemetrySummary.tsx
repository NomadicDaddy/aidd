import { Card } from '../../components/ui/card.tsx';
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

function CountCard({
	className,
	label,
	value,
}: {
	className: string;
	label: string;
	value: number;
}) {
	return (
		<Card className="space-y-1">
			<div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
				<span aria-hidden="true" className={`h-2 w-2 rounded-full ${className}`} />
				{label}
			</div>
			<div className="text-2xl font-semibold text-foreground tabular-nums">{value}</div>
		</Card>
	);
}

export function TelemetrySummary({ totals }: { totals: TelemetryTotals }) {
	return (
		<section aria-label="Invocation summary" className="space-y-3">
			{/* Shape-of-work breakdown: categorical, so it uses series slots rather than tones. */}
			<div className="grid gap-3 sm:grid-cols-3">
				<CountCard
					className={seriesSolid.slot1}
					label="Total invocations"
					value={totals.total}
				/>
				<CountCard
					className={seriesSolid.slot2}
					label="Top-level actions"
					value={totals.topLevel}
				/>
				<CountCard
					className={seriesSolid.slot3}
					label="Nested steps"
					value={totals.nested}
				/>
			</div>
			{/* Outcome breakdown: shares the outcome ramp with the chart bars and legend below. */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
				<CountCard
					className={outcomeSolid.completed}
					label="Completed"
					value={totals.completed}
				/>
				<CountCard
					className={outcomeSolid.warnings}
					label="Warnings"
					value={totals.warnings}
				/>
				<CountCard className={outcomeSolid.failed} label="Failed" value={totals.failed} />
				<CountCard
					className={outcomeSolid.flagged}
					label="Flagged"
					value={totals.flagged}
				/>
				<CountCard
					className={outcomeSolid.stopped}
					label="Stopped"
					value={totals.stopped}
				/>
				<CountCard className={outcomeSolid.killed} label="Killed" value={totals.killed} />
				<CountCard className={outcomeSolid.noWork} label="No work" value={totals.noWork} />
				<CountCard
					className={outcomeSolid.running}
					label="Running"
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
