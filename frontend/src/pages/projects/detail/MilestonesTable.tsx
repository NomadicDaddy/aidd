import { default as ArrowDown } from 'lucide-react/dist/esm/icons/arrow-down';
import { default as ArrowUp } from 'lucide-react/dist/esm/icons/arrow-up';
import { default as Pencil } from 'lucide-react/dist/esm/icons/pencil';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { Link } from 'react-router';

import type { ProjectMilestone } from '../../../api/types.ts';

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { IconButton } from '../../../components/ui/button.tsx';
import { dangerRowActionClass } from '../../../lib/tones.ts';
import { milestoneProgressLabel } from './milestonesUtils.ts';
import { projectDetailTabSearch } from './overviewLinks.ts';

export function MilestonesTable({
	activeMilestone,
	busy,
	milestones,
	onDelete,
	onEdit,
	onMove,
}: {
	activeMilestone: null | string;
	busy: boolean;
	milestones: ProjectMilestone[];
	onDelete: (milestone: ProjectMilestone) => void;
	onEdit: (milestone: ProjectMilestone) => void;
	onMove: (milestone: ProjectMilestone, position: number) => void;
}) {
	return (
		<OverflowScroller ariaLabel="Project milestones">
			<table aria-label="Project milestones" className="w-full text-left text-sm">
				<thead className="border-b border-border bg-muted text-xs text-muted-foreground uppercase">
					<tr>
						<th className="w-14 px-4 py-3" scope="col">
							#
						</th>
						<th className="px-4 py-3" scope="col">
							Milestone
						</th>
						<th className="px-4 py-3" scope="col">
							Description
						</th>
						<th className="w-40 px-4 py-3" scope="col">
							Features
						</th>
						<th className="w-36 px-4 py-3 text-right" scope="col">
							Actions
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border">
					{milestones.map((milestone, index) => (
						<tr key={milestone.name}>
							<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
								{milestone.priority}
							</td>
							<td className="px-4 py-3">
								<Link
									className="font-medium text-foreground hover:text-teal-700 dark:hover:text-teal-300"
									to={projectDetailTabSearch('features', {
										featureMilestone: milestone.name,
									})}>
									{milestone.name}
								</Link>
								{milestone.name === activeMilestone ? (
									<Badge className="ml-1.5" tone="neutral">
										current
									</Badge>
								) : null}
							</td>
							<td className="px-4 py-3 text-muted-foreground">
								{milestone.description ?? '—'}
							</td>
							<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
								{milestoneProgressLabel(milestone.completed, milestone.total)}
							</td>
							<td className="px-4 py-3">
								<div className="flex items-center justify-end gap-1">
									<IconButton
										ariaLabel={`Move ${milestone.name} earlier`}
										disabled={busy || index === 0}
										onClick={() => onMove(milestone, index)}>
										<ArrowUp className="h-4 w-4" />
									</IconButton>
									<IconButton
										ariaLabel={`Move ${milestone.name} later`}
										disabled={busy || index === milestones.length - 1}
										onClick={() => onMove(milestone, index + 2)}>
										<ArrowDown className="h-4 w-4" />
									</IconButton>
									<IconButton
										ariaLabel={`Edit ${milestone.name}`}
										disabled={busy}
										onClick={() => onEdit(milestone)}>
										<Pencil className="h-4 w-4" />
									</IconButton>
									<IconButton
										ariaLabel={`Delete ${milestone.name}`}
										className={dangerRowActionClass}
										disabled={busy || milestones.length < 2}
										onClick={() => onDelete(milestone)}
										variant="ghost">
										<Trash2 className="h-4 w-4" />
									</IconButton>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</OverflowScroller>
	);
}
