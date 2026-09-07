import { default as CircleHelp } from 'lucide-react/dist/esm/icons/circle-help';
import { useId, useState } from 'react';
import { Link } from 'react-router';

import type {
	GitCommitRef,
	ProjectFeature,
	ProjectLocalIteration,
	ProjectLocalRun,
} from '../../../api/types.ts';

import { CommitChips } from '../../../components/shared/CommitChips.tsx';
import { CommitDiffDialog } from '../../../components/shared/CommitDiffDialog.tsx';
import { DisclosureMarker } from '../../../components/shared/DisclosureMarker.tsx';
import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { ExecutionIdentityBadges } from '../../../components/shared/ExecutionIdentityBadges.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { IconButton } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { SegmentedControl } from '../../../components/ui/segmented-control.tsx';
import { Tooltip } from '../../../components/ui/tooltip.tsx';
import { useDiaryEntries } from '../../../hooks/useDiary.ts';
import { filterRegister } from '../../../lib/filterFields.ts';
import { formatTimeOfDay } from '../../../lib/formatters.ts';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { tableColumnClass } from '../../../lib/tableStyles.ts';
import { touchTargetRowClass } from '../../../lib/touchTarget.ts';
import { proseMeasureClass } from '../../../lib/typography.ts';
import { DiaryLoadState } from './HistoryDiaryState.tsx';
import {
	buildHistoryEvents,
	filterHistoryEvents,
	groupHistoryEventsByDay,
	HISTORY_FILTERS,
	type HistoryEvent,
	type HistoryFilter,
	historyFilterCounts,
	historyFilterLabels,
	historyKindLabels,
} from './historyTimeline.ts';
import { Pagination } from './Pagination.tsx';

const HISTORY_PAGE_SIZE = 25;
const WEB_RUN_ID_PATTERN = /^run_\d+_[0-9a-f]{8}$/u;

function eventLink(event: HistoryEvent, projectPath: string): string {
	if (event.kind === 'diary') return '?tab=diary';
	if (event.featureDirectory) {
		return `?tab=features&featureQ=${encodeURIComponent(event.featureDirectory)}`;
	}
	const project = encodeURIComponent(projectPath);
	if (event.runId && !WEB_RUN_ID_PATTERN.test(event.runId)) return `/runs?project=${project}`;
	return event.runId
		? `/runs?project=${project}&run=${encodeURIComponent(event.runId)}`
		: `/runs?project=${project}`;
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
	const isRun = event.kind === 'run';
	const hasRunDetails = isRun && event.commits.length > 0;
	const link = eventLink(event, projectPath);
	return (
		<li className="relative py-2">
			<div className="grid min-w-0 items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(18rem,1fr)_8rem_8rem_auto]">
				<Link
					className={`min-w-0 rounded-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:outline-none ${touchTargetRowClass}`}
					to={link}>
					{event.title}
				</Link>
				<span className="text-xs font-medium text-muted-foreground">
					{historyKindLabels[event.kind]}
				</span>
				<Badge tone={event.badgeTone}>{event.badge}</Badge>
				<time
					className="text-xs text-muted-foreground tabular-nums sm:text-right"
					dateTime={event.timestamp}>
					{formatTimeOfDay(event.timestamp)}
				</time>
			</div>
			<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
				{event.duration ? <span className="tabular-nums">{event.duration}</span> : null}
				{event.executionIdentity ? (
					<ExecutionIdentityBadges {...event.executionIdentity} />
				) : null}
				{/* The run id, mono like the commit SHA on the row below it. It sat in
					    proportional type beside the mono backend and model chips, and it was
					    the full 36-character UUID; `shortRunId` now cuts it to the same eight
					    characters a short hash uses. */}
				{event.traceLabel ? <span className="font-mono">{event.traceLabel}</span> : null}
				{isRun && event.sourceLabel ? (
					<span className="min-w-0 break-words">{event.sourceLabel}</span>
				) : null}
			</div>
			{event.kind === 'diary' && event.sourceLabel ? (
				<p
					className={`mt-0.5 line-clamp-2 text-xs text-muted-foreground ${proseMeasureClass}`}>
					{event.sourceLabel}
				</p>
			) : null}
			{hasRunDetails ? (
				<details className="group mt-1 text-xs text-muted-foreground">
					<summary className="inline-flex min-h-6 w-fit cursor-pointer list-none items-center gap-1 rounded font-medium text-foreground marker:content-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:outline-none max-sm:min-h-11">
						<DisclosureMarker />
						Run details
					</summary>
					<div className={`mt-1 space-y-2 pl-4 ${proseMeasureClass}`}>
						{event.commits.length > 0 ? (
							<CommitChips commits={event.commits} onSelect={onSelectCommit} />
						) : null}
					</div>
				</details>
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
	const completionHelpId = useId();
	// Scoped to this project by path, never the fleet listing. Diary rows join the timeline as they
	// load: features and runs are already rendered from props, and useInfiniteQuery keeps the pages
	// it has while fetching the next, so neither the first load nor a later page blanks the list.
	const diaryQuery = useDiaryEntries(projectPath);
	const diaryEntries = diaryQuery.data?.pages.flatMap((page) => page.entries) ?? [];
	const events = buildHistoryEvents(features, localRuns, localIterations, diaryEntries);
	const counts = historyFilterCounts(events);
	const filtered = filterHistoryEvents(events, filter);
	const pageEvents = filtered.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);
	const groups = groupHistoryEventsByDay(pageEvents);
	const filterOptions = HISTORY_FILTERS.map((value) => ({
		count: counts[value],
		disabled: counts[value] === 0,
		label: historyFilterLabels[value],
		value,
	}));

	function resetFilters(): void {
		setFilter('all');
		setPage(0);
	}
	const emptyFilters = filterRegister(resetFilters, [
		filter !== 'all' && { label: 'Kind', value: historyFilterLabels[filter] },
	]);

	return (
		<div className={`space-y-4 ${tableColumnClass}`}>
			<TabIntro title="History" />
			<Card className="p-0">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2 sm:py-3">
					<span className={`${fieldLabelClass} max-sm:sr-only`}>Event kind</span>
					<p className="sr-only" id={completionHelpId}>
						Completion times use the feature&apos;s last metadata update when no
						completion timestamp was recorded.
					</p>
					<div className="order-last ml-auto max-sm:hidden">
						<Tooltip content="Completion times use the feature's last metadata update when no completion timestamp was recorded.">
							<IconButton ariaLabel="About history completion times" variant="ghost">
								<CircleHelp className="h-4 w-4" />
							</IconButton>
						</Tooltip>
					</div>
					<SegmentedControl<HistoryFilter>
						ariaDescribedBy={completionHelpId}
						ariaLabel="Filter history events by kind"
						onChange={(next) => {
							setFilter(next);
							setPage(0);
						}}
						options={filterOptions}
						value={filter}
					/>
				</div>
				{filter === 'all' || filter === 'diary' ? (
					<DiaryLoadState
						entryCount={diaryEntries.length}
						hasNextPage={diaryQuery.hasNextPage}
						isError={diaryQuery.isError}
						isFetchingNextPage={diaryQuery.isFetchingNextPage}
						isPending={diaryQuery.isPending}
						onLoadMore={() => void diaryQuery.fetchNextPage()}
						onRetry={() => void diaryQuery.refetch()}
					/>
				) : null}
				{filtered.length === 0 ? (
					<div className="px-4 pb-4">
						<EmptyState
							filterReset="toolbar"
							filters={events.length === 0 ? undefined : emptyFilters}>
							{events.length === 0
								? 'No dated events recorded for this project yet.'
								: 'No events match the selected filter.'}
						</EmptyState>
					</div>
				) : (
					<div className="space-y-4 px-4 pb-4">
						{groups.map((group) => (
							<section key={group.key}>
								<CardHeader
									className="sticky top-[var(--app-topbar-height,0px)] z-10 mb-1.5 border-b border-border bg-card py-2"
									// The divider is the container for the rows under it, and at the subsection
									// rank it landed on `text-sm font-semibold` against event titles at
									// `text-sm font-medium` — one weight step apart at the same size and colour,
									// which is not enough for a sticky label a reader navigates by. `section`
									// separates them by size as well. Nothing else in this card is a heading, so
									// there is no card title for it to compete with.
									headingLevel={3}
									level="section"
									title={group.label}
								/>
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
		</div>
	);
}
