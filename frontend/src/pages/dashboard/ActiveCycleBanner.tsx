import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { Link } from 'react-router-dom';

import type { DirectorCycle } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import {
	cycleElapsed,
	cycleStageDescriptions,
	cycleStageLabels,
} from '../../lib/directorConstants.ts';
import { formatDate } from '../../lib/formatters.ts';

export function ActiveCycleBanner({ cycle, now }: { cycle: DirectorCycle; now: number }) {
	return (
		<section aria-label="Active director cycle">
			<Card
				className="border-teal-200 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/30"
				variant="panel">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="text-foreground flex items-center gap-2 text-sm font-semibold">
							<Activity className="h-4 w-4 text-teal-700 dark:text-teal-300" />
							Director cycle running
							<Badge pulse showDot tone="cyan">
								{cycleStageLabels[cycle.stage]}
							</Badge>
						</div>
						<p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
							{cycleStageDescriptions[cycle.stage]}
						</p>
						<p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
							Elapsed {cycleElapsed(cycle, now)} / started{' '}
							{formatDate(cycle.startedAt)}
						</p>
					</div>
					<Link
						className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-teal-700 transition-colors outline-none hover:text-teal-950 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-teal-300 dark:hover:text-teal-100 dark:focus-visible:ring-offset-slate-950"
						to="/director">
						View cycle
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				</div>
			</Card>
		</section>
	);
}
