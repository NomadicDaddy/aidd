import type { ReactNode } from 'react';

import { useState } from 'react';

import type { DiaryKindFilter, DiaryWindowFilter } from './diaryFilters.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { LoadingState } from '../../components/shared/LoadingState.tsx';
import { Button } from '../../components/ui/button.tsx';
import { useDiaryEntries, useDiaryTimeline } from '../../hooks/useDiary.ts';
import { cn } from '../../lib/cn.ts';
import { formatRelativeAge } from '../../lib/formatters.ts';
import { sectionCaptionClass } from '../../lib/typography.ts';
import { DiaryEntryCard } from './DiaryEntryCard.tsx';
import { DiaryFilterBar } from './DiaryFilterBar.tsx';
import { diaryFilterRegister, filterDiaryEntries, filterTimelineItems } from './diaryFilters.ts';
import { groupDiaryByDay } from './diaryItems.ts';
import { DiaryTimelineGrid, DiaryTimelineList } from './DiaryTimelineList.tsx';

export function DiaryFeed({
	activityDisclosureLimit,
	emptyMessage = 'No diary entries or activity yet.',
	filterAction,
	filterHeader,
	projectPath,
	showProject = false,
}: {
	activityDisclosureLimit?: number;
	emptyMessage?: string;
	filterAction?: ReactNode;
	filterHeader?: ReactNode;
	projectPath?: string;
	showProject?: boolean;
}) {
	const entriesQuery = useDiaryEntries(projectPath);
	const timelineQuery = useDiaryTimeline(projectPath);
	const [kind, setKind] = useState<DiaryKindFilter>('all');
	const [timeWindow, setTimeWindow] = useState<DiaryWindowFilter>('all');
	// Seeded once so the window boundary cannot drift between renders and re-bucket rows mid-scroll.
	const [now] = useState(() => Date.now());

	if (entriesQuery.isLoading || timelineQuery.isLoading) {
		return <LoadingState message="Loading diary…" />;
	}

	const allEntries = entriesQuery.data?.pages.flatMap((page) => page.entries) ?? [];
	const allItems = timelineQuery.data?.pages.flatMap((page) => page.items) ?? [];
	const total = allEntries.length + allItems.length;

	const entries = filterDiaryEntries(allEntries, kind, timeWindow, now);
	const items = filterTimelineItems(allItems, kind, timeWindow, now);
	const groups = groupDiaryByDay(entries, items, now);
	const DayHeading = projectPath ? 'h3' : 'h2';

	function resetFilters(): void {
		setKind('all');
		setTimeWindow('all');
	}
	const emptyFilters = diaryFilterRegister(kind, timeWindow, resetFilters);

	return (
		// PageRail owns the shared width, so every child border, rule, hover band, and control ends on
		// the same edge without restating the page measure.
		<div className="page-reveal max-w-[80rem] space-y-5">
			<DiaryFilterBar
				action={filterAction}
				header={filterHeader}
				kind={kind}
				onKindChange={setKind}
				onReset={resetFilters}
				onWindowChange={setTimeWindow}
				shown={entries.length + items.length}
				timeWindow={timeWindow}
				total={total}
			/>
			{groups.length === 0 ? (
				// Nothing loaded at all is not a narrowed result: there is no register to name and no
				// reset worth offering, so the two states differ by what the box contains rather than
				// by whether a reader notices one word of copy changed.
				<EmptyState filterReset="toolbar" filters={total === 0 ? undefined : emptyFilters}>
					{total === 0 ? emptyMessage : 'No activity matches the current filters.'}
				</EmptyState>
			) : (
				<DiaryTimelineGrid kindFilter={kind} showProject={showProject}>
					{groups.map((group) => (
						<section
							className="col-span-full grid grid-cols-subgrid gap-x-2"
							key={group.key}>
							{/* The day is the feed's only structural divider, so it outranks the row
						    titles it governs and stays visible through a long scroll. It takes the
						    shared section caption rather than a `text-sm font-semibold` of its own:
						    at that treatment the grouping level and the content level sat on the
						    same 14px foreground step and differed only by weight, so the heading
						    read as one more entry title. */}
							<DayHeading
								className={cn(
									sectionCaptionClass,
									'col-span-full',
									// Below `sm` the shell nav is a sticky bar in flow at `z-20`, so a heading stuck at
									// `top-0` sits inside its footprint and is painted over entirely. The offset is
									// the shell's own published height, which is 0px once the rail goes `fixed`.
									'sticky top-[var(--app-topbar-height,0px)] z-10 mb-2 border-t border-border bg-background/90 pt-4 pb-2 backdrop-blur',
								)}>
								<span>{group.label}</span>
								<span
									className="ml-2 font-normal tracking-normal normal-case"
									title={new Date(`${group.key}T00:00:00`).toLocaleDateString()}>
									·{' '}
									{formatRelativeAge(
										new Date(`${group.key}T00:00:00`).toISOString(),
									)}
								</span>
							</DayHeading>
							<div className="col-span-full grid grid-cols-subgrid gap-x-2 gap-y-3">
								{group.entries.map((entry) => (
									<div className="col-span-full" key={entry.id}>
										<DiaryEntryCard entry={entry} showProject={showProject} />
									</div>
								))}
								<DiaryTimelineList
									{...(activityDisclosureLimit === undefined
										? {}
										: { initiallyVisible: activityDisclosureLimit })}
									items={group.items}
									kindFilter={kind}
									scopeLabel={group.label}
									showProject={showProject}
								/>
							</div>
						</section>
					))}
				</DiaryTimelineGrid>
			)}
			{entriesQuery.hasNextPage || timelineQuery.hasNextPage ? (
				// One pager over one feed, because there is one counter over one feed. "More
				// entries" and "More activity" each paged half of what "Showing 1 of 70 loaded"
				// counted, so the reader was offered two scopes the number above them did not
				// distinguish. Pressing this extends whichever halves still have history; both
				// land in the same day groups either way.
				<div className="flex justify-center border-t border-border pt-4">
					<Button
						disabled={
							entriesQuery.isFetchingNextPage || timelineQuery.isFetchingNextPage
						}
						onClick={() => {
							if (entriesQuery.hasNextPage) void entriesQuery.fetchNextPage();
							if (timelineQuery.hasNextPage) void timelineQuery.fetchNextPage();
						}}
						variant="secondary">
						{entriesQuery.isFetchingNextPage || timelineQuery.isFetchingNextPage
							? 'Loading…'
							: 'Load more'}
					</Button>
				</div>
			) : null}
		</div>
	);
}
