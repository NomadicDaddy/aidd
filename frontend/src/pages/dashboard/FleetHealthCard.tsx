import { default as Gauge } from 'lucide-react/dist/esm/icons/gauge';

import type { FleetSummary } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { toneSolid, toneText } from '../../lib/tones.ts';
import { type getHealthTone, healthBandLabel } from './dashboard-shared.ts';

/**
 * The fleet pass rate and the band behind it — and nothing the metric row above already states.
 *
 * This card used to restate the Priority Health tile ("2488 passing", "92% pass rate") and the
 * Projects tile (an ACTIVE / HEALTHY / NEED ATTENTION trio repeating "33 / 5 / 28") directly beneath
 * them, so the same two numbers were printed five ways above the fold. The metric row owns the
 * headline numbers; what is left here is the one thing it cannot show — the score as a bar, and the
 * band diagnostic that explains it.
 */
export function FleetHealthCard({
	featureHealthTone,
	featureHealthValue,
	fleet,
}: {
	featureHealthTone: ReturnType<typeof getHealthTone>;
	featureHealthValue: number;
	fleet: FleetSummary | undefined;
}) {
	const band = fleet?.fleetAggregations.priorityHealth.band;
	return (
		<Card variant="panel">
			{/* The band was the only statement that most of the fleet needs attention and it sat in
			    the description slot, at the same weight the neighbouring cards use for static
			    boilerplate, directly under an emerald 92%. It reads as a Badge beside the score it
			    qualifies. */}
			<CardHeader
				badge={
					<>
						<Badge showDot tone={featureHealthTone}>
							{featureHealthValue}%
						</Badge>
						{band ? (
							<Badge tone={band === 'healthy' ? 'emerald' : 'amber'}>
								{healthBandLabel(band)}
							</Badge>
						) : null}
					</>
				}
				description="Share of fleet features passing, and the band driving the score."
				icon={<Gauge className={`h-4 w-4 ${toneText.teal}`} />}
				title="Fleet Health"
			/>
			<div className="h-2.5 overflow-hidden rounded-full bg-muted shadow-inner">
				<div
					aria-hidden="true"
					className={`h-full rounded-full ${toneSolid[featureHealthTone]} transition-[width] duration-500`}
					style={{ width: `${featureHealthValue}%` }}
				/>
			</div>
		</Card>
	);
}
