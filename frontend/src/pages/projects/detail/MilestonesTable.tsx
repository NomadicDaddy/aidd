import { default as ArrowDown } from 'lucide-react/dist/esm/icons/arrow-down';
import { default as ArrowUp } from 'lucide-react/dist/esm/icons/arrow-up';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as Pencil } from 'lucide-react/dist/esm/icons/pencil';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { Link } from 'react-router';

import type { ProjectMilestone } from '../../../api/types.ts';

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { IconButton } from '../../../components/ui/button.tsx';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { dangerRowActionClass, toneTextHover } from '../../../lib/tones.ts';
import { touchTargetTextClass } from '../../../lib/touchTarget.ts';
import { milestoneStatePresentation } from '../projects-list-visuals.ts';
import { milestoneProgressLabel } from './milestonesUtils.ts';
import { projectDetailTabSearch } from './overviewLinks.ts';

interface MilestonesProps {
	activeMilestone: null | string;
	busy: boolean;
	milestones: ProjectMilestone[];
	onDelete: (milestone: ProjectMilestone) => void;
	onEdit: (milestone: ProjectMilestone) => void;
	onMove: (milestone: ProjectMilestone, position: number) => void;
}

function MilestoneStateBadge({
	activeMilestone,
	milestone,
}: {
	activeMilestone: null | string;
	milestone: ProjectMilestone;
}) {
	const state = milestoneStatePresentation(milestone, activeMilestone);
	return (
		<Badge className="ml-1.5" showDot={state.label === 'current'} tone={state.tone}>
			{state.label}
		</Badge>
	);
}

function MilestoneProgress({ completed, total }: { completed: number; total: number }) {
	const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
	return (
		<div className="min-w-[6rem] space-y-1">
			<span className="block font-mono text-xs whitespace-nowrap text-muted-foreground">
				{milestoneProgressLabel(completed, total)}
			</span>
			<div
				aria-label={`${percent}% passing`}
				aria-valuemax={100}
				aria-valuemin={0}
				aria-valuenow={percent}
				className="h-1.5 overflow-hidden rounded-full bg-muted"
				role="progressbar">
				<div className="h-full bg-accent" style={{ width: `${percent}%` }} />
			</div>
		</div>
	);
}

/**
 * The four row controls, written once for both renderings.
 *
 * Reorder is the reason this table exists, so it is the one thing the card stack could not drop:
 * `onMove` takes a 1-based target position, which is why later is `index + 2` and not `index + 1`.
 */
function MilestoneRowActions({
	busy,
	count,
	index,
	milestone,
	onDelete,
	onEdit,
	onMove,
}: {
	busy: boolean;
	count: number;
	index: number;
	milestone: ProjectMilestone;
	onDelete: (milestone: ProjectMilestone) => void;
	onEdit: (milestone: ProjectMilestone) => void;
	onMove: (milestone: ProjectMilestone, position: number) => void;
}) {
	return (
		<div className="flex items-center justify-end gap-1">
			<IconButton
				ariaLabel={`Move ${milestone.name} earlier`}
				disabled={busy || index === 0}
				onClick={() => onMove(milestone, index)}>
				<ArrowUp className="h-4 w-4" />
			</IconButton>
			<IconButton
				ariaLabel={`Move ${milestone.name} later`}
				disabled={busy || index === count - 1}
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
				disabled={busy || count < 2}
				onClick={() => onDelete(milestone)}>
				<Trash2 className="h-4 w-4" />
			</IconButton>
		</div>
	);
}

/**
 * The phone rendering of the same rows.
 *
 * The table's own minimum is about 670px — 56px for the priority column, 160px for Features, 188px
 * for four 36px icon buttons and their padding, and what is left over for a name and a sentence of
 * description — so `lg` is the smallest tier whose content column (736px with the rail expanded)
 * holds it, and this stands in below that.
 */
function MilestonesList({
	activeMilestone,
	busy,
	milestones,
	onDelete,
	onEdit,
	onMove,
}: MilestonesProps) {
	return (
		<div className="space-y-2 p-4 lg:hidden">
			{milestones.map((milestone, index) => (
				<div
					className={
						milestone.name === activeMilestone
							? 'rounded-md border border-accent/40 bg-accent/[0.04] p-3'
							: 'rounded-md border border-border p-3'
					}
					key={milestone.name}>
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							<Link
								className={`font-medium text-foreground ${toneTextHover.teal} ${touchTargetTextClass}`}
								to={projectDetailTabSearch('features', {
									featureMilestone: milestone.name,
								})}>
								{milestone.name}
								<ChevronRight
									aria-hidden="true"
									className="ml-1 inline h-3.5 w-3.5"
								/>
							</Link>
							<MilestoneStateBadge
								activeMilestone={activeMilestone}
								milestone={milestone}
							/>
						</div>
						<span className="shrink-0 font-mono text-xs text-muted-foreground">
							#{milestone.priority}
						</span>
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						{milestone.description ?? '—'}
					</p>
					<div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 max-sm:flex-col max-sm:items-stretch">
						<MilestoneProgress
							completed={milestone.completed}
							total={milestone.total}
						/>
						<MilestoneRowActions
							busy={busy}
							count={milestones.length}
							index={index}
							milestone={milestone}
							onDelete={onDelete}
							onEdit={onEdit}
							onMove={onMove}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

export function MilestonesTable(props: MilestonesProps) {
	const { activeMilestone, busy, milestones, onDelete, onEdit, onMove } = props;
	return (
		<>
			<MilestonesList {...props} />
			<OverflowScroller ariaLabel="Project milestones" className="hidden lg:block">
				<table aria-label="Project milestones" className="w-full text-left text-sm">
					{/* Description had no stated share, so auto layout handed it every spare pixel:
					    1364px at 2250x1309, where the v1.0 row set a 133-character sentence on one
					    line and the eye then travelled that whole width to reach `12/12 passing`.
					    The same column collapsed to ~215px at 1024, five wrapped lines and a 125px
					    row. One column swung 1364 → 215 with nothing in between.

					    Preferences rather than `table-fixed`: the four 36px icon buttons in Actions
					    need about 188px and a fixed 17% of an `lg` content column is 125px, which
					    would clip them. Auto layout still lets a column outgrow its share when its
					    content demands it — which is why the measure cap below, not the percentage,
					    is what actually bounds the sentence. */}
					<colgroup>
						<col />
						<col />
						<col className="w-1" />
						<col className="w-1" />
					</colgroup>
					<thead className={tableHeadClass}>
						<tr>
							<th className="px-4 py-3" scope="col">
								Milestone
							</th>
							<th className="px-4 py-3" scope="col">
								Description
							</th>
							<th className="px-4 py-3" scope="col">
								Features
							</th>
							<th className="px-4 py-3 text-right" scope="col">
								Actions
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{milestones.map((milestone, index) => (
							<tr
								className={
									milestone.name === activeMilestone
										? 'bg-accent/[0.04] transition-colors hover:bg-accent/[0.08]'
										: 'transition-colors hover:bg-muted/40'
								}
								key={milestone.name}>
								<td className="px-4 py-3">
									<Link
										className={`font-medium text-foreground ${toneTextHover.teal} ${touchTargetTextClass}`}
										to={projectDetailTabSearch('features', {
											featureMilestone: milestone.name,
										})}>
										{milestone.name}
									</Link>
									<MilestoneStateBadge
										activeMilestone={activeMilestone}
										milestone={milestone}
									/>
									<span className="ml-2 font-mono text-xs text-muted-foreground">
										#{milestone.priority}
									</span>
								</td>
								<td className="px-4 py-3 text-muted-foreground">
									{/* A measure, not a column width. 60ch is the widest this
									    sentence gets however wide the table is. */}
									<span className="block max-w-[60ch]">
										{milestone.description ?? '—'}
									</span>
								</td>
								<td className="px-4 py-3 whitespace-nowrap">
									<MilestoneProgress
										completed={milestone.completed}
										total={milestone.total}
									/>
								</td>
								<td className="px-4 py-3 whitespace-nowrap">
									<MilestoneRowActions
										busy={busy}
										count={milestones.length}
										index={index}
										milestone={milestone}
										onDelete={onDelete}
										onEdit={onEdit}
										onMove={onMove}
									/>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</OverflowScroller>
		</>
	);
}
