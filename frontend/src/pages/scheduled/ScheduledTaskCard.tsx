import type { ScheduledTask } from 'aidd-shared/contracts/scheduled-tasks';

import { default as ArchiveIcon } from 'lucide-react/dist/esm/icons/archive';
import { default as Ellipsis } from 'lucide-react/dist/esm/icons/ellipsis';
import { default as History } from 'lucide-react/dist/esm/icons/history';
import { default as Pause } from 'lucide-react/dist/esm/icons/pause';
import { default as Pencil } from 'lucide-react/dist/esm/icons/pencil';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as RotateCw } from 'lucide-react/dist/esm/icons/rotate-cw';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { RelativeAge } from '../../components/shared/RelativeAge.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, IconButton } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { DropdownMenu } from '../../components/ui/dropdown-menu.tsx';
import { useScheduledExecutions } from '../../hooks/useScheduledTasks.ts';
import { cn } from '../../lib/cn.ts';
import { humanizeEnum } from '../../lib/formatters.ts';
import { type Tone } from '../../lib/tones.ts';
import { microLabelClass } from '../../lib/typography.ts';
import { sessionStatusTone } from '../runs/pipelineSessionStatus.ts';
import {
	advancedScheduleDescription,
	projectScopeLabel,
	scheduleSummary,
} from './scheduledLabels.ts';
import { ScheduledOccurrence } from './ScheduledOccurrence.tsx';
import { canResumeScheduledTask } from './scheduledTaskActions.ts';

interface ScheduledTaskCardProps {
	action: (id: string, value: 'archive' | 'pause' | 'resume' | 'run') => void;
	expanded: boolean;
	onEdit: (id: string) => void;
	onToggleOccurrences: (id: string) => void;
	task: ScheduledTask;
}

const TASK_IDENTIFIER_START_LENGTH = 16;
const TASK_IDENTIFIER_END_LENGTH = 8;
const TASK_IDENTIFIER_PREFIX = 'scheduled_task_';

const TASK_STATE_TONES: Record<ScheduledTask['state'], Tone> = {
	active: 'teal',
	archived: 'neutral',
	completed: 'emerald',
	paused: 'amber',
};

function taskIdentifierLabel(id: string, expanded: boolean): string {
	const displayId = id.startsWith(TASK_IDENTIFIER_PREFIX)
		? id.slice(TASK_IDENTIFIER_PREFIX.length)
		: id;
	if (expanded) return displayId;
	const visibleLength = TASK_IDENTIFIER_START_LENGTH + TASK_IDENTIFIER_END_LENGTH;
	if (displayId.length <= visibleLength) return displayId;
	return `${displayId.slice(0, TASK_IDENTIFIER_START_LENGTH)}…${displayId.slice(-TASK_IDENTIFIER_END_LENGTH)}`;
}

export function ScheduledTaskCard({
	action,
	expanded,
	onEdit,
	onToggleOccurrences,
	task,
}: ScheduledTaskCardProps) {
	const executions = useScheduledExecutions(task.id, expanded ? 20 : 1);
	const occurrences = (executions.data?.pages ?? []).flatMap((page) => page.executions);
	const lastOccurrence = occurrences[0];
	const lastOccurrenceLabel = lastOccurrence
		? null
		: executions.isPending
			? 'Loading occurrence…'
			: executions.isError
				? 'Occurrence unavailable'
				: 'No occurrence yet';
	const scheduleDescription =
		task.schedule.kind === 'cron'
			? advancedScheduleDescription(task.schedule.expression)
			: null;
	const cardClass = cn('@container flex flex-col gap-3', expanded && 'lg:col-span-full');
	const canResume = canResumeScheduledTask(task);

	return (
		<Card className={cardClass} variant="panel">
			<CardHeader
				className="mb-0 max-w-[58rem]"
				identifier={<span title={task.id}>{taskIdentifierLabel(task.id, expanded)}</span>}
				status={
					<>
						{task.systemKey !== null && <Badge tone="violet">System</Badge>}
						<Badge showDot tone={TASK_STATE_TONES[task.state]}>
							{humanizeEnum(task.state)}
						</Badge>
					</>
				}
				title={task.name}
			/>
			<div className="grid max-w-[58rem] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
				<span className={`${microLabelClass} text-muted-foreground`}>Next</span>
				{task.nextRunAt === null ? (
					<span className="text-sm text-muted-foreground">No future occurrence</span>
				) : (
					<span className="justify-self-start">
						<RelativeAge
							className="text-sm text-foreground tabular-nums"
							compact
							value={task.nextRunAt}
						/>
					</span>
				)}
				<span className={`${microLabelClass} text-muted-foreground`}>Last</span>
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					{lastOccurrence ? (
						<>
							<RelativeAge
								className="text-sm text-foreground tabular-nums"
								value={lastOccurrence.startedAt}
							/>
							<Badge showDot tone={sessionStatusTone(lastOccurrence.status)}>
								{humanizeEnum(lastOccurrence.status)}
							</Badge>
						</>
					) : (
						<span className="text-sm text-muted-foreground">{lastOccurrenceLabel}</span>
					)}
				</div>
			</div>
			<div className="max-w-[58rem] space-y-1">
				<p className="text-sm text-muted-foreground">
					{humanizeEnum(task.target.type)} ·{' '}
					{projectScopeLabel(task.projectScope, task.projects.length)}
				</p>
				<p
					className="flex flex-wrap gap-x-3 font-mono text-xs text-muted-foreground"
					title={scheduleDescription ?? undefined}>
					{task.schedule.kind === 'cron' ? (
						<>
							<span>{task.schedule.expression}</span>
							<span>{task.schedule.timezone}</span>
						</>
					) : (
						<span>{scheduleSummary(task.schedule)}</span>
					)}
				</p>
			</div>
			{task.systemKey !== null && (
				<p className="max-w-[58rem] text-xs text-muted-foreground">
					Built in. Pause it instead of archiving.
				</p>
			)}
			{/* The task summary shares the form measure while occurrence records may use the full card. */}
			<div className="mt-auto flex max-w-[58rem] flex-col gap-2 border-t border-border pt-3">
				{task.state !== 'archived' && (
					<div className="flex flex-wrap gap-2">
						<Button onClick={() => action(task.id, 'run')} variant="secondary">
							<Play aria-hidden="true" className="h-4 w-4" />
							Run now
						</Button>
						{task.state === 'active' ? (
							<Button onClick={() => action(task.id, 'pause')} variant="secondary">
								<Pause aria-hidden="true" className="h-4 w-4" />
								Pause
							</Button>
						) : canResume ? (
							<Button onClick={() => action(task.id, 'resume')} variant="secondary">
								<RotateCw aria-hidden="true" className="h-4 w-4" />
								Resume
							</Button>
						) : null}
					</div>
				)}
				<div className="flex w-full items-center gap-2 self-start">
					<Button
						aria-controls={`scheduled-occurrences-${task.id}`}
						aria-expanded={expanded}
						onClick={() => onToggleOccurrences(task.id)}
						variant="ghost">
						<History aria-hidden="true" className="h-4 w-4" />
						Occurrences
						<DisclosureMarker open={expanded} />
					</Button>
					{task.state !== 'archived' && (
						<DropdownMenu
							className="ml-auto"
							items={[
								{
									icon: <Pencil aria-hidden="true" className="h-4 w-4" />,
									label: 'Edit',
									onSelect: () => onEdit(task.id),
								},
								...(task.systemKey === null
									? [
											{
												'data-tone': 'danger' as const,
												icon: (
													<ArchiveIcon
														aria-hidden="true"
														className="h-4 w-4"
													/>
												),
												label: 'Archive',
												onSelect: () => action(task.id, 'archive'),
											},
										]
									: []),
							]}
							trigger={({ ref, ...triggerProps }) => (
								<IconButton
									{...triggerProps}
									ariaLabel={`Open actions for ${task.name}`}
									ref={ref}
									variant="ghost">
									<Ellipsis aria-hidden="true" className="h-4 w-4" />
								</IconButton>
							)}
						/>
					)}
				</div>
			</div>
			<div
				aria-hidden={!expanded}
				className="scheduled-occurrence-disclosure"
				data-expanded={expanded}
				data-scheduled-occurrences-motion=""
				id={`scheduled-occurrences-${task.id}`}
				inert={!expanded}>
				<div className="scheduled-content-reveal-inner">
					<div className="space-y-2 pt-3">
						<div className="flex max-w-[58rem] items-center gap-2">
							<h3 className="text-sm font-semibold">Occurrence history</h3>
							<span className="text-xs text-muted-foreground tabular-nums">
								{occurrences.length}
								{executions.hasNextPage ? '+' : ''}{' '}
								{occurrences.length === 1 ? 'occurrence' : 'occurrences'}
							</span>
						</div>
						{occurrences.length === 0 ? (
							<p className="text-sm text-muted-foreground">No occurrences yet.</p>
						) : (
							occurrences.map((execution) => (
								<ScheduledOccurrence execution={execution} key={execution.id} />
							))
						)}
						{executions.hasNextPage && (
							<Button
								disabled={executions.isFetchingNextPage}
								onClick={() => void executions.fetchNextPage()}
								size="compact"
								variant="ghost">
								Load older occurrences
							</Button>
						)}
					</div>
				</div>
			</div>
		</Card>
	);
}
