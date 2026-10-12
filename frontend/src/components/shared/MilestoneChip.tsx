import type { ProjectMilestoneSummary } from '../../api/types.ts';

import { milestoneBadgeTone, milestoneChipProgress } from '../../lib/projectPresentation.ts';
import { Badge } from '../ui/badge.tsx';

/**
 * The compact milestone chip the projects card and the dashboard row both print: the name, the
 * fraction of planned work that passes, and how many members are set aside.
 */
export function MilestoneChip({
	milestone,
	name,
}: {
	milestone: ProjectMilestoneSummary;
	name: string;
}) {
	const { deferred, fraction } = milestoneChipProgress(milestone);
	return (
		<Badge tone={milestoneBadgeTone(milestone)}>
			<span className="font-medium">{name}</span>
			{fraction === null ? null : <span className="ml-1 tabular-nums">{fraction}</span>}
			{deferred === null ? null : (
				<span className="ml-1 text-muted-foreground tabular-nums">{deferred}</span>
			)}
		</Badge>
	);
}
