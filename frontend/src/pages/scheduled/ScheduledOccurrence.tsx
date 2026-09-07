import type { ScheduledTaskExecution } from 'aidd-shared/contracts/scheduled-tasks';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { FilePath } from '../../components/shared/FilePath.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useNow } from '../../hooks/useNow.ts';
import { formatDate, formatDuration, formatTimeOfDay, humanizeEnum } from '../../lib/formatters.ts';
import { sessionStatusTone } from '../runs/pipelineSessionStatus.ts';
import { occurrenceProjectsLabel } from './scheduledLabels.ts';
import { ScheduledOccurrenceChildren } from './ScheduledOccurrenceChildren.tsx';

const dayFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function sameLocalDay(first: number, second: number): boolean {
	const firstDate = new Date(first);
	const secondDate = new Date(second);
	return (
		firstDate.getFullYear() === secondDate.getFullYear() &&
		firstDate.getMonth() === secondDate.getMonth() &&
		firstDate.getDate() === secondDate.getDate()
	);
}

function occurrenceWindow(execution: ScheduledTaskExecution): string {
	if (execution.completedAt === null) return `Started ${formatDate(execution.startedAt)}`;
	if (!sameLocalDay(execution.startedAt, execution.completedAt)) {
		return `${formatDate(execution.startedAt)} to ${formatDate(execution.completedAt)}`;
	}
	return `${dayFormatter.format(execution.startedAt)} ${formatTimeOfDay(execution.startedAt)} to ${formatTimeOfDay(execution.completedAt)}`;
}

function OccurrenceProjects({ execution }: { execution: ScheduledTaskExecution }) {
	if (execution.projectPaths.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">{occurrenceProjectsLabel(execution)}</p>
		);
	}
	return (
		<details className="group">
			<summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-xs text-muted-foreground tabular-nums marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
				<DisclosureMarker />
				{execution.projectPaths.length}{' '}
				{execution.projectPaths.length === 1 ? 'project' : 'projects'}
			</summary>
			<ul className="mt-2 space-y-1.5 border-l border-border pl-3">
				{execution.projectPaths.map((path) => (
					<li className="min-w-0 font-mono text-xs" key={path}>
						<FilePath className="break-all text-foreground" path={path} />
					</li>
				))}
			</ul>
		</details>
	);
}

export function ScheduledOccurrence({ execution }: { execution: ScheduledTaskExecution }) {
	const now = useNow(execution.completedAt === null);
	const elapsed = Math.max(0, (execution.completedAt ?? now) - execution.startedAt);
	return (
		/* The record is fixed-schema: keep the compact card composition until all five operational
		   fields fit as one scan line at the expanded-card budget.

		   It is a nested record inside the task card, so the fill, radius and border are the
		   declared sunken variant. The hand-rolled bg-muted/40 with no border sat a few RGB
		   steps off every other nested panel and lost the boundary entirely once two
		   occurrences stacked. */
		<Card
			className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 p-3 text-sm @min-[58rem]:grid-cols-[7rem_17rem_9rem_minmax(8rem,1fr)_7rem] @min-[58rem]:items-center @min-[58rem]:gap-x-4"
			variant="sunken">
			<Badge className="justify-self-start" tone="neutral">
				{humanizeEnum(execution.trigger)}
			</Badge>
			<span className="col-span-2 row-start-2 min-w-0 font-mono text-xs text-muted-foreground @min-[32rem]:col-span-1 @min-[32rem]:col-start-1 @min-[58rem]:col-auto @min-[58rem]:row-auto">
				{occurrenceWindow(execution)}
			</span>
			<span className="col-span-2 row-start-3 font-mono text-xs text-muted-foreground @min-[32rem]:col-span-1 @min-[32rem]:col-start-2 @min-[32rem]:row-start-2 @min-[32rem]:justify-self-end @min-[58rem]:col-auto @min-[58rem]:row-auto @min-[58rem]:justify-self-start">
				Duration {formatDuration(elapsed)}
			</span>
			<div className="col-span-2 row-start-4 @min-[32rem]:row-start-3 @min-[58rem]:col-auto @min-[58rem]:row-auto">
				<OccurrenceProjects execution={execution} />
			</div>
			<Badge
				className="col-start-2 row-start-1 justify-self-end @min-[58rem]:col-start-5 @min-[58rem]:row-auto"
				showDot
				tone={sessionStatusTone(execution.status)}>
				{humanizeEnum(execution.status)}
			</Badge>
			{/* A skip is the scheduler behaving as designed, so its reason is muted rather than
			    styled as a failure. */}
			{execution.dispatchErrors.map((error) => (
				<p
					className={
						execution.status === 'skipped'
							? 'col-span-2 text-xs text-muted-foreground @min-[58rem]:col-span-full'
							: 'text-destructive col-span-2 text-xs @min-[58rem]:col-span-full'
					}
					key={error}>
					{error}
				</p>
			))}
			{execution.children.length > 0 ? (
				<div className="col-span-2 @min-[58rem]:col-span-full">
					<ScheduledOccurrenceChildren children={execution.children} />
				</div>
			) : null}
		</Card>
	);
}
