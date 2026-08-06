import { useState } from 'react';

import type { DiaryKindFilter, DiaryWindowFilter } from './diaryFilters.ts';

import { LoadingState } from '../../components/shared/LoadingState.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDiaryEntries, useDiaryTimeline } from '../../hooks/useDiary.ts';
import { cn } from '../../lib/cn.ts';
import { sectionCaptionClass } from '../../lib/typography.ts';
import { DiaryEntryCard } from './DiaryEntryCard.tsx';
import { DiaryFilterBar } from './DiaryFilterBar.tsx';
import { filterDiaryEntries, filterTimelineItems } from './diaryFilters.ts';
import { groupDiaryByDay } from './diaryItems.ts';
import { DiaryTimelineList } from './DiaryTimelineList.tsx';

export function DiaryFeed({
	emptyMessage = 'No diary entries or activity yet.',
	projectPath,
	showProject = false,
	width = 'reading',
}: {
	emptyMessage?: string;
	projectPath?: string;
	showProject?: boolean;
	/**
	 * `reading` caps the feed at a reading column; `full` lets it fill its container.
	 *
	 * The cap is right for /diary, where the feed is the whole page and nothing beside it sets an
	 * expectation. It is wrong inside the project Diary tab, where the cap made the feed 1024px
	 * under its own 1312px header card and beside sibling tabs that all run the shell width.
	 */
	width?: 'full' | 'reading';
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

	if (total === 0) {
		return (
			<Card>
				<p className="text-sm text-muted-foreground">{emptyMessage}</p>
			</Card>
		);
	}

	const entries = filterDiaryEntries(allEntries, kind, timeWindow, now);
	const items = filterTimelineItems(allItems, kind, timeWindow, now);
	const groups = groupDiaryByDay(entries, items, now);

	return (
		// The feed is a reading column, not a table: at full shell width the content occupied the
		// left third and the stamp the right edge, with roughly 740px of empty band between them.
		// The prose inside a row is measured separately (`max-w-[68ch]` on the detail line, the
		// shared prose measure on entry markdown), so a caller that fills its container is not
		// giving up the line length — only the position of the timestamp rail.
		<div className={cn('space-y-5', width === 'reading' && 'max-w-5xl')}>
			<DiaryFilterBar
				kind={kind}
				onKindChange={setKind}
				onWindowChange={setTimeWindow}
				shown={entries.length + items.length}
				timeWindow={timeWindow}
				total={total}
			/>
			{groups.length === 0 ? (
				<Card>
					<p className="text-sm text-muted-foreground">
						No activity matches the current filters.
					</p>
				</Card>
			) : (
				groups.map((group) => (
					<section aria-label={group.label} key={group.key}>
						{/* The day is the feed's only structural divider, so it outranks the row
						    titles it governs and stays visible through a long scroll. It takes the
						    shared section caption rather than a `text-sm font-semibold` of its own:
						    at that treatment the grouping level and the content level sat on the
						    same 14px foreground step and differed only by weight, so the heading
						    read as one more entry title. */}
						<h2
							className={cn(
								sectionCaptionClass,
								// Below `sm` the shell nav is a sticky bar in flow at `z-20`, so a heading stuck at
								// `top-0` sits inside its footprint and is painted over entirely. The offset is
								// the shell's own published height, which is 0px once the rail goes `fixed`.
								'sticky top-[var(--app-topbar-height,0px)] z-10 mb-2 border-t border-border bg-background/90 pt-4 pb-2 backdrop-blur',
							)}>
							{group.label}
						</h2>
						<div className="space-y-3">
							{group.entries.map((entry) => (
								<DiaryEntryCard
									entry={entry}
									key={entry.id}
									showProject={showProject}
								/>
							))}
							<DiaryTimelineList items={group.items} showProject={showProject} />
						</div>
					</section>
				))
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
