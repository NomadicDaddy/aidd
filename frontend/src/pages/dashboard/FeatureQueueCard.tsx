/* eslint-disable react-refresh/only-export-components */
import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as ListTodo } from 'lucide-react/dist/esm/icons/list-todo';
import { Link } from 'react-router-dom';

import type { FleetSummary } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';

const MAX_QUEUE_ITEMS = 6;

export interface FeatureQueueItem {
	featureId: string;
	priority: null | number;
	projectId: string | undefined;
	projectName: string;
	title: string;
}

function priorityTone(priority: null | number): 'amber' | 'cyan' | 'neutral' | 'red' {
	if (priority === null) return 'neutral';
	if (priority <= 1) return 'red';
	if (priority <= 2) return 'amber';
	if (priority <= 3) return 'cyan';
	return 'neutral';
}

/**
 * Flattens each fleet project's open feature backlog (`backlog.feature.top`) into a single
 * fleet-wide queue ordered by numeric priority (lowest number first), then by project name.
 * `projectIdByName` resolves a fleet `slug` (the project basename) to its route id so each row
 * can deep-link to that project's features tab.
 */
export function buildFeatureQueue(
	fleet: FleetSummary | undefined,
	projectIdByName: Map<string, string>
): FeatureQueueItem[] {
	return (fleet?.projects ?? [])
		.flatMap((project) =>
			project.backlog.feature.top.map((item) => ({
				featureId: item.id,
				priority: item.priority,
				projectId: projectIdByName.get(project.slug),
				projectName: project.slug,
				title: item.title,
			}))
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
		<>
			<div className="min-w-0">
				<p className="line-clamp-2 text-sm font-semibold text-neutral-950 dark:text-neutral-50">
					{item.title}
				</p>
				<p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
					{item.projectName}
				</p>
			</div>
			<Badge showDot tone={priorityTone(item.priority)}>
				{item.priority === null ? 'P—' : `P${item.priority}`}
			</Badge>
		</>
	);

	if (item.projectId === undefined) {
		return (
			<li className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 bg-white/75 p-3 dark:border-neutral-800 dark:bg-slate-950/60">
				{body}
			</li>
		);
	}

	return (
		<li>
			<Link
				className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 bg-white/75 p-3 transition-[border-color,background-color] duration-150 outline-none hover:border-cyan-300 hover:bg-cyan-50/50 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-neutral-800 dark:bg-slate-950/60 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/20 dark:focus-visible:ring-offset-slate-950"
				to={`/projects/${encodeURIComponent(item.projectId)}?tab=features`}>
				{body}
			</Link>
		</li>
	);
}

export function FeatureQueueCard({
	isLoading,
	queue,
}: {
	isLoading: boolean;
	queue: FeatureQueueItem[];
}) {
	return (
		<Card variant="panel">
			<div className="mb-4 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 text-sm font-semibold text-neutral-950 dark:text-neutral-50">
					<ListTodo className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
					Feature Queue
				</div>
				<Link
					className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-cyan-700 transition-colors outline-none hover:text-cyan-950 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-cyan-300 dark:hover:text-cyan-100 dark:focus-visible:ring-offset-slate-950"
					to="/projects">
					Projects
					<ArrowRight className="h-3.5 w-3.5" />
				</Link>
			</div>
			{isLoading && queue.length === 0 ? (
				<SkeletonLines count={5} label="Loading feature queue…" />
			) : queue.length === 0 ? (
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
				<ul className="space-y-2">
					{queue.map((item) => (
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
