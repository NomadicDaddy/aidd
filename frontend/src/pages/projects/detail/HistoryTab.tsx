import { default as CircleHelp } from 'lucide-react/dist/esm/icons/circle-help';
import { useState } from 'react';
import { Link } from 'react-router';

import type {
	GitCommitRef,
	ProjectFeature,
	ProjectLocalIteration,
	ProjectLocalRun,
} from '../../../api/types.ts';

import { CommitChips } from '../../../components/shared/CommitChips.tsx';
import { CommitDiffDialog } from '../../../components/shared/CommitDiffDialog.tsx';
import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { IconButton } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { SegmentedControl } from '../../../components/ui/segmented-control.tsx';
import { Tooltip } from '../../../components/ui/tooltip.tsx';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { touchTargetTextClass } from '../../../lib/touchTarget.ts';
import {
	buildHistoryEvents,
	filterHistoryEvents,
	groupHistoryEventsByDay,
	HISTORY_FILTERS,
	type HistoryEvent,
	type HistoryFilter,
	historyFilterCounts,
	historyFilterLabels,
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
	const hasDetail =
		Boolean(event.executionIdentity) ||
		event.detailParts.length > 0 ||
		event.traceLabel.length > 0;
	return (
		<li className="py-1">
			<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
				<Badge tone={event.badgeTone}>{event.badge}</Badge>
				<Link
					className={`font-medium text-foreground hover:underline ${touchTargetTextClass}`}
					to={eventLink(event, projectPath)}>
					{event.title}
				</Link>
				<RelativeAge className="text-xs text-muted-foreground" value={event.timestamp} />
			</div>
			{hasDetail ? (
				<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
					{event.executionIdentity ? (
						<ExecutionIdentityBadges {...event.executionIdentity} />
					) : null}
					{/* `min-w-0`: a run's work summary is one long sentence, and a flex item's
					    default `min-width: auto` is its content's min-content width, so the
					    summary pushed the row past the list's measure instead of wrapping
					    inside it. */}
					{event.detailParts.map((part) => (
						<span className="min-w-0" key={part}>
							{part}
						</span>
					))}
					{/* The run id, mono like the commit SHA on the row below it. It sat in
					    proportional type beside the mono backend and model chips, and it was
					    the full 36-character UUID; `shortRunId` now cuts it to the same eight
					    characters a short hash uses. */}
					{event.traceLabel ? (
						<span className="font-mono">{event.traceLabel}</span>
					) : null}
				</div>
			) : null}
			{event.commits.length > 0 ? (
				<div className="mt-1">
					<CommitChips commits={event.commits} onSelect={onSelectCommit} />
				</div>
			) : null}
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
		<Card className="max-w-[72rem] overflow-hidden p-0">
			<CardHeader
				action={
					<Tooltip content="Completion times use the feature's last metadata update when no completion timestamp was recorded.">
						<IconButton ariaLabel="About history completion times" variant="ghost">
							<CircleHelp className="h-4 w-4" />
						</IconButton>
					</Tooltip>
				}
				className="mb-0 border-b border-border px-4 py-3"
				description="Feature, remediation, audit-finding, and run events, newest first."
				title="Project history"
			/>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2 sm:py-3">
				<span className={fieldLabelClass}>Event kind</span>
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
				<p className="px-4 pb-6 text-sm text-muted-foreground">
					{events.length === 0
						? 'No dated events recorded for this project yet.'
						: 'No events match the selected filter.'}
				</p>
			) : (
				<div className="space-y-4 px-4 pb-4">
					{groups.map((group) => (
						<section aria-label={group.label} key={group.key}>
							<h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{group.label}
							</h3>
							<ul className="divide-y divide-border text-sm">
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
