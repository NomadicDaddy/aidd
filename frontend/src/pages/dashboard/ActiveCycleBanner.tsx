import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { Link } from 'react-router';

import type { DirectorCycle } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import {
	cycleElapsed,
	cycleStageDescriptions,
	cycleStageLabels,
} from '../../lib/directorConstants.ts';
import { formatDate } from '../../lib/formatters.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';

export function ActiveCycleBanner({ cycle, now }: { cycle: DirectorCycle; now: number }) {
	return (
		<section aria-label="Active director cycle">
			<Card className={`${toneBorder.teal} ${toneSurface.teal}`} variant="panel">
				<CardHeader
					action={
						<Link className={cardHeaderLinkClass} to="/director">
							View cycle
							<ArrowRight className="h-3.5 w-3.5" />
						</Link>
					}
					badge={
						<Badge pulse showDot tone="teal">
							{cycleStageLabels[cycle.stage]}
						</Badge>
					}
					className="mb-0"
					description={
						<>
							<span className="block text-sm text-foreground">
								{cycleStageDescriptions[cycle.stage]}
							</span>
							<span className="mt-1 block">
								Elapsed {cycleElapsed(cycle, now)} / started{' '}
								{formatDate(cycle.startedAt)}
							</span>
						</>
					}
					icon={<Activity className={`h-4 w-4 ${toneText.teal}`} />}
					title="Director cycle running"
				/>
			</Card>
		</section>
	);
}
