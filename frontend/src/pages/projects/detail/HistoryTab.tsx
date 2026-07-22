import { useState } from 'react';
import { Link } from 'react-router-dom';

import type {
	GitCommitRef,
	ProjectFeature,
	ProjectLocalIteration,
	ProjectLocalRun,
} from '../../../api/types.ts';

import { CommitChips } from '../../../components/shared/CommitChips.tsx';
import { CommitDiffDialog } from '../../../components/shared/CommitDiffDialog.tsx';
import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { SegmentedControl } from '../../../components/ui/segmented-control.tsx';
import { formatDate, formatRelativeAge } from '../../../lib/formatters.ts';
import {
	buildHistoryEvents,
	filterHistoryEvents,
	groupHistoryEventsByDay,
	HISTORY_FILTERS,
	historyFilterCounts,
	historyFilterLabels,
	type HistoryEvent,
	type HistoryFilter,
} from './historyTimeline.ts';
import { Pagination } from './Pagination.tsx';

const HISTORY_PAGE_SIZE = 25;

function eventLink(event: HistoryEvent, projectPath: string): string {
	if (event.featureDirectory) {
		return `?tab=features&featureQ=${encodeURIComponent(event.featureDirectory)}`;
	}
	return `/runs?project=${encodeURIComponent(projectPath)}`;
}

function HistoryEventRow({
	event,
	onSelectCommit,
	projectPath,
}: {
	event: HistoryEvent;
	onSelectCommit: (commit: GitCommitRef) => void;
	projectPath: string;
}) {
	return (
		<li className="rounded-md border border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<Badge tone={event.badgeTone}>{event.badge}</Badge>
						<Link
							className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
							to={eventLink(event, projectPath)}>
							{event.title}
						</Link>
					</div>
					{event.executionIdentity ? (
						<ExecutionIdentityBadges {...event.executionIdentity} className="mt-1" />
					) : null}
					{event.detailParts.length > 0 ? (
						<div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-neutral-500">
							{event.detailParts.map((part) => (
								<span key={part}>{part}</span>
							))}
						</div>
					) : null}
					{event.commits.length > 0 ? (
						<div className="mt-1.5">
							<CommitChips commits={event.commits} onSelect={onSelectCommit} />
						</div>
					) : null}
				</div>
				<span
					className="shrink-0 text-xs text-neutral-500"
					title={formatDate(event.timestamp)}>
					{formatRelativeAge(event.timestamp)}
				</span>
			</div>
		</li>
	);
}

export function HistoryTab({
	features,
	localIterations,
	localRuns,
	projectId,
	projectPath,
}: {
	features: ProjectFeature[];
	localIterations: ProjectLocalIteration[];
	localRuns: ProjectLocalRun[];
	projectId: string;
	projectPath: string;
}) {
	const [filter, setFilter] = useState<HistoryFilter>('all');
	const [page, setPage] = useState(0);
	const [selectedCommit, setSelectedCommit] = useState<GitCommitRef | null>(null);
	const events = buildHistoryEvents(features, localRuns, localIterations);
	const counts = historyFilterCounts(events);
	const filtered = filterHistoryEvents(events, filter);
	const pageEvents = filtered.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);
	const groups = groupHistoryEventsByDay(pageEvents);
	const filterOptions = HISTORY_FILTERS.map((value) => ({
		label: `${historyFilterLabels[value]} (${counts[value]})`,
		value,
	}));
	return (
		<Card className="overflow-hidden p-0">
			<div className="border-b px-4 py-3 dark:border-neutral-800">
				<h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
					Project history
				</h2>
				<p className="text-xs text-neutral-500">
					Timeline of feature, remediation, and audit-finding lifecycle events merged with
					recorded runs, newest first. Completion times fall back to the feature&apos;s
					last metadata update when no completion timestamp was recorded.
				</p>
			</div>
			<div className="px-4 py-3">
				<SegmentedControl<HistoryFilter>
					ariaLabel="Filter history events by kind"
					onChange={(next) => {
						setFilter(next);
						setPage(0);
					}}
					options={filterOptions}
					value={filter}
				/>
			</div>
			{filtered.length === 0 ? (
				<p className="px-4 pb-6 text-sm text-neutral-500">
					{events.length === 0
						? 'No dated events recorded for this project yet.'
						: 'No events match the selected filter.'}
				</p>
			) : (
				<div className="space-y-4 px-4 pb-4">
					{groups.map((group) => (
						<section aria-label={group.label} key={group.key}>
							<h3 className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
								{group.label}
							</h3>
							<ul className="space-y-1.5 text-sm">
								{group.events.map((event) => (
									<HistoryEventRow
										event={event}
										key={event.id}
										onSelectCommit={setSelectedCommit}
										projectPath={projectPath}
									/>
								))}
							</ul>
						</section>
					))}
				</div>
			)}
			<Pagination
				onChange={setPage}
				page={page}
				pageSize={HISTORY_PAGE_SIZE}
				total={filtered.length}
			/>
			{selectedCommit ? (
				<CommitDiffDialog
					commit={selectedCommit}
					onClose={() => setSelectedCommit(null)}
					projectId={projectId}
				/>
			) : null}
		</Card>
	);
}
