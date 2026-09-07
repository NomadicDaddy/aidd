import type { Tone } from '../../lib/tones.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { toneSolid } from '../../lib/tones.ts';
import { healthBandLabel } from './dashboard-shared.ts';

/**
 * The bar and the band chip, in the Priority Health tile's `footer` slot.
 *
 * A Fleet Health card of their own below the metric row would print the same pass percentage the
 * Priority Health tile already states, and the only things it would carry that the tile does not
 * are this bar and this band. The `footer` slot exists for a progress bar under a caption, so the
 * number is stated once, above the fold.
 */
export function PriorityHealthFooter({
	band,
	tone,
	value,
}: {
	band: string | undefined;
	tone: Tone;
	value: number;
}) {
	return (
		<div className="mt-3 space-y-2">
			<div className="h-1.5 overflow-hidden rounded-full bg-muted">
				<div
					aria-hidden="true"
					className={`h-full rounded-full ${toneSolid[tone]} transition-[width] duration-500`}
					style={{ width: `${value}%` }}
				/>
			</div>
			{band ? (
				<Badge tone={band === 'healthy' ? 'emerald' : 'amber'}>
					{healthBandLabel(band)}
				</Badge>
			) : null}
		</div>
	);
}
