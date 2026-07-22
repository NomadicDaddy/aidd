import { default as Gauge } from 'lucide-react/dist/esm/icons/gauge';

import type { FleetSummary } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { toneSolid } from '../../lib/tones.ts';
import { type getHealthTone, healthBandLabel } from './dashboard-shared.ts';

export function FleetHealthCard({
	_fleetFeatureTotal,
	failingProjects,
	featureHealthTone,
	featureHealthValue,
	fleet,
	fleetFeaturePassing,
	healthyProjects,
	projectCount,
}: {
	_fleetFeatureTotal: number;
	failingProjects: number;
	featureHealthTone: ReturnType<typeof getHealthTone>;
	featureHealthValue: number;
	fleet: FleetSummary | undefined;
	fleetFeaturePassing: number;
	healthyProjects: number;
	projectCount: number;
}) {
	return (
		<Card className="overflow-hidden" variant="panel">
			<div className="flex items-start justify-between gap-4">
				<div>
					<div className="flex items-center gap-2 text-sm font-semibold text-neutral-950 dark:text-neutral-50">
						<Gauge className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
						Fleet Health
					</div>
					<p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
						{fleet?.fleetAggregations.priorityHealth.band
							? healthBandLabel(fleet.fleetAggregations.priorityHealth.band)
							: 'Priority health'}
					</p>
				</div>
				<Badge showDot tone={featureHealthTone}>
					{featureHealthValue}%
				</Badge>
			</div>
			<div className="mt-5">
				<div className="mb-2 flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
					<span>{fleetFeaturePassing} passing</span>
					<span>
						{fleet?.fleetAggregations.featurePassRate ?? featureHealthValue}% pass rate
					</span>
				</div>
				<div className="h-3 overflow-hidden rounded-full bg-neutral-200 shadow-inner dark:bg-slate-800">
					<div
						aria-hidden="true"
						className={`h-full rounded-full ${toneSolid[featureHealthTone]} transition-[width] duration-500`}
						style={{ width: `${featureHealthValue}%` }}
					/>
				</div>
			</div>
			<div className="mt-5 text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
				Projects
			</div>
			<div className="mt-2 grid gap-3 sm:grid-cols-3">
				<div className="rounded-md bg-cyan-50 p-3 dark:bg-cyan-950/20">
					<div className="text-xs font-medium tracking-wide text-cyan-700 uppercase dark:text-cyan-300">
						Active
					</div>
					<div className="mt-1 text-lg font-semibold text-cyan-950 tabular-nums dark:text-cyan-100">
						{projectCount}
					</div>
				</div>
				<div className="rounded-md bg-emerald-50 p-3 dark:bg-emerald-950/20">
					<div className="text-xs font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-300">
						Healthy
					</div>
					<div className="mt-1 text-lg font-semibold text-emerald-950 tabular-nums dark:text-emerald-100">
						{healthyProjects}
					</div>
				</div>
				<div className="rounded-md bg-amber-50 p-3 dark:bg-amber-950/20">
					<div className="text-xs font-medium tracking-wide text-amber-700 uppercase dark:text-amber-300">
						Need Attention
					</div>
					<div className="mt-1 text-lg font-semibold text-amber-950 tabular-nums dark:text-amber-100">
						{failingProjects}
					</div>
				</div>
			</div>
		</Card>
	);
}
