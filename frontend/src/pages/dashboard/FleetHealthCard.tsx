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
		<Card variant="panel">
			<div className="flex items-start justify-between gap-4">
				<div>
					<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
						<Gauge className="h-4 w-4 text-teal-600 dark:text-teal-300" />
						Fleet Health
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
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
				<div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
					<span>{fleetFeaturePassing} passing</span>
					<span>
						{fleet?.fleetAggregations.featurePassRate ?? featureHealthValue}% pass rate
					</span>
				</div>
				<div className="h-2.5 overflow-hidden rounded-full bg-muted shadow-inner">
					<div
						aria-hidden="true"
						className={`h-full rounded-full ${toneSolid[featureHealthTone]} transition-[width] duration-500`}
						style={{ width: `${featureHealthValue}%` }}
					/>
				</div>
			</div>
			<div className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
				Projects
			</div>
			<div className="mt-2 grid gap-2 sm:grid-cols-3">
				<StatTile color="teal" label="Active" value={projectCount} />
				<StatTile color="emerald" label="Healthy" value={healthyProjects} />
				<StatTile color="amber" label="Need Attention" value={failingProjects} />
			</div>
		</Card>
	);
}

function StatTile({
	color,
	label,
	value,
}: {
	color: 'amber' | 'emerald' | 'teal';
	label: string;
	value: number;
}) {
	const styles: Record<string, string> = {
		amber: 'border-amber-200/60 bg-amber-50/80 dark:border-amber-800/40 dark:bg-amber-950/20',
		emerald:
			'border-emerald-200/60 bg-emerald-50/80 dark:border-emerald-800/40 dark:bg-emerald-950/20',
		teal: 'border-teal-200/60 bg-teal-50/80 dark:border-teal-800/40 dark:bg-teal-950/20',
	};
	const textStyles: Record<string, string> = {
		amber: 'text-amber-700 dark:text-amber-300',
		emerald: 'text-emerald-700 dark:text-emerald-300',
		teal: 'text-teal-700 dark:text-teal-300',
	};
	const valueStyles: Record<string, string> = {
		amber: 'text-amber-950 dark:text-amber-100',
		emerald: 'text-emerald-950 dark:text-emerald-100',
		teal: 'text-teal-950 dark:text-teal-100',
	};

	return (
		<div className={`rounded-lg border p-3 ${styles[color]}`}>
			<div
				className={`text-[0.65rem] font-semibold tracking-wide uppercase ${textStyles[color]}`}>
				{label}
			</div>
			<div
				className={`mt-1 font-display text-lg font-semibold tabular-nums ${valueStyles[color]}`}>
				{value}
			</div>
		</div>
	);
}
