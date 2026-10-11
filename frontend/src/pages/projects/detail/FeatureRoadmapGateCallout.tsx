import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';

import type { ProjectRoadmapSummary } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { cn } from '../../../lib/cn.ts';
import { toneBorder, toneText } from '../../../lib/tones.ts';
import { unmappedRoadmapCallout } from './featuresUtils.ts';

/** Names what is blocking coding selection: features with no milestone, or an invalid one. */
export function FeatureRoadmapGateCallout({
	onShowUnassigned,
	roadmap,
}: {
	onShowUnassigned: () => void;
	roadmap: null | ProjectRoadmapSummary;
}) {
	const gate = unmappedRoadmapCallout(roadmap);
	if (!gate) return null;
	return (
		<Card className={cn('flex flex-wrap items-center gap-2', toneBorder.red)}>
			<ShieldCheck className={`h-4 w-4 ${toneText.red}`} />
			<span className="text-sm text-muted-foreground">
				{gate.names.length > 0 ? (
					<>
						{gate.names.length} feature director
						{gate.names.length === 1 ? 'y has' : 'ies have'} no roadmap milestone and
						block{gate.names.length === 1 ? 's' : ''} coding selection:{' '}
						<span className="font-mono" title={gate.names.join(', ')}>
							{gate.names.slice(0, 5).join(', ')}
							{gate.names.length > 5 ? ', …' : ''}
						</span>
					</>
				) : null}
				{gate.invalid.length > 0 ? (
					<>
						{gate.names.length > 0 ? ' — plus ' : ''}
						{gate.invalid.length} invalid milestone reference
						{gate.invalid.length === 1 ? '' : 's'} (
						<span className="font-mono">
							{gate.invalid
								.slice(0, 3)
								.map((entry) => `${entry.featureDirectory}→${entry.milestone}`)
								.join(', ')}
							{gate.invalid.length > 3 ? ', …' : ''}
						</span>
						)
					</>
				) : null}
			</span>
			{gate.names.length > 0 ? (
				<Button className="ml-auto" onClick={onShowUnassigned} variant="secondary">
					Show unassigned
				</Button>
			) : null}
		</Card>
	);
}
