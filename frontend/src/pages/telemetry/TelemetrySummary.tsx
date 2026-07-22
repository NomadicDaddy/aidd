import { Card } from '../../components/ui/card.tsx';

export interface TelemetryTotals {
	completed: number;
	failed: number;
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
			<div className="flex items-center gap-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
				<span aria-hidden="true" className={`h-2 w-2 rounded-full ${className}`} />
				{label}
			</div>
			<div className="text-2xl font-semibold text-neutral-950 tabular-nums dark:text-neutral-50">
				{value}
			</div>
		</Card>
	);
}

export function TelemetrySummary({ totals }: { totals: TelemetryTotals }) {
	return (
		<section aria-label="Invocation summary" className="space-y-3">
			<div className="grid gap-3 sm:grid-cols-3">
				<CountCard className="bg-cyan-500" label="Total invocations" value={totals.total} />
				<CountCard
					className="bg-blue-500"
					label="Top-level actions"
					value={totals.topLevel}
				/>
				<CountCard className="bg-indigo-400" label="Nested steps" value={totals.nested} />
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
				<CountCard className="bg-emerald-500" label="Completed" value={totals.completed} />
				<CountCard className="bg-amber-400" label="Warnings" value={totals.warnings} />
				<CountCard className="bg-red-400" label="Failed" value={totals.failed} />
				<CountCard className="bg-neutral-400" label="Stopped" value={totals.stopped} />
				<CountCard className="bg-orange-700" label="Killed" value={totals.killed} />
				<CountCard className="bg-slate-500" label="No work" value={totals.noWork} />
				<CountCard className="bg-cyan-500" label="Running" value={totals.running} />
			</div>
			<p className="text-xs text-neutral-500">
				Every top-level launch and every nested recipe or skill step is one invocation. Each
				invocation appears in exactly one outcome above.
			</p>
		</section>
	);
}
