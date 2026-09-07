/* eslint-disable react-refresh/only-export-components */
import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as ListTodo } from 'lucide-react/dist/esm/icons/list-todo';
import { Link } from 'react-router';

import type { FleetSummary } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { tableMeasureClass } from '../../lib/tableStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { priorityLabel, priorityTone } from './dashboard-shared.ts';

const MAX_QUEUE_ITEMS = 6;

export interface FeatureQueueItem {
	featureId: string;
	priority: null | number;
	projectId: string | undefined;
	projectName: string;
	title: string;
}

/**
 * Flattens each fleet project's open feature backlog (`backlog.feature.top`) into a single
 * fleet-wide queue ordered by numeric priority (lowest number first), then by project name.
 * `projectIdByName` resolves a fleet `slug` (the project basename) to its route id so each row
 * can deep-link to that project's features tab.
 */
export function buildFeatureQueue(
	fleet: FleetSummary | undefined,
	projectIdByName: Map<string, string>,
): FeatureQueueItem[] {
	return (fleet?.projects ?? [])
		.flatMap((project) =>
			project.backlog.feature.top.map((item) => ({
				featureId: item.id,
				priority: item.priority,
				projectId: projectIdByName.get(project.slug),
				projectName: project.slug,
				title: item.title,
			})),
		)
		.sort((left, right) => {
			const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER;
			const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER;
			if (leftPriority !== rightPriority) return leftPriority - rightPriority;
			return left.projectName.localeCompare(right.projectName);
		})
		.slice(0, MAX_QUEUE_ITEMS);
}

function FeatureQueueRow({ item }: { item: FeatureQueueItem }) {
	const body = (
		<div className="flex min-w-0 items-start gap-3">
			<div className="min-w-0">
				<p className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</p>
				<p className="mt-1 truncate text-xs text-muted-foreground">{item.projectName}</p>
			</div>
			<Badge tone={priorityTone(item.priority)}>{priorityLabel(item.priority)}</Badge>
		</div>
	);

	if (item.projectId === undefined) {
		return <li className="rounded-md border border-border bg-card/75 p-3">{body}</li>;
	}

	return (
		<li>
			<Link
				className="block rounded-md border border-border bg-card/75 p-3 transition-[border-color,background-color] duration-150 outline-none hover:border-accent/40 hover:bg-accent-muted/60 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				to={`/projects/${encodeURIComponent(item.projectId)}?tab=features`}>
				{body}
			</Link>
		</li>
	);
}

export function FeatureQueueCard({
	isLoading,
	queue,
	total,
}: {
	isLoading: boolean;
	queue: FeatureQueueItem[];
	total: number;
}) {
	const visibleQueue = queue.slice(0, MAX_QUEUE_ITEMS);
	return (
		<Card variant="panel">
			<CardHeader
				action={
					<Link className={cardHeaderLinkClass} to="/projects">
						Projects
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
				badge={
					<Badge showDot tone={total > 0 ? 'amber' : 'emerald'}>
						{visibleQueue.length} of {total} queued
					</Badge>
				}
				description="Highest-priority open features across the fleet."
				icon={<ListTodo className={`h-4 w-4 ${toneText.teal}`} />}
				title="Feature Queue"
			/>
			{isLoading && visibleQueue.length === 0 ? (
				<SkeletonLines count={5} label="Loading feature queue…" />
			) : visibleQueue.length === 0 ? (
				<EmptyState
					action={
						<Link className={buttonClassName('secondary')} to="/projects">
							Open projects
							<ArrowRight className="h-3.5 w-3.5" />
						</Link>
					}>
					No open features queued across the fleet.
				</EmptyState>
			) : (
				<ul className={`space-y-2 ${tableMeasureClass}`}>
					{visibleQueue.map((item) => (
						<FeatureQueueRow
							item={item}
							key={`${item.projectName}:${item.featureId}`}
						/>
					))}
				</ul>
			)}
		</Card>
	);
}
