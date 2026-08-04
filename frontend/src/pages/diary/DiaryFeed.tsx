import { LoadingState } from '../../components/shared/LoadingState.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDiaryEntries, useDiaryTimeline } from '../../hooks/useDiary.ts';
import { DiaryEntryCard } from './DiaryEntryCard.tsx';
import { groupDiaryByDay } from './diaryItems.ts';
import { DiaryTimelineList } from './DiaryTimelineList.tsx';

export function DiaryFeed({
	emptyMessage = 'No diary entries or activity yet.',
	projectPath,
	showProject = false,
}: {
	emptyMessage?: string;
	projectPath?: string;
	showProject?: boolean;
}) {
	const entriesQuery = useDiaryEntries(projectPath);
	const timelineQuery = useDiaryTimeline(projectPath);

	if (entriesQuery.isLoading || timelineQuery.isLoading) {
		return <LoadingState message="Loading diary…" />;
	}

	const entries = entriesQuery.data?.pages.flatMap((page) => page.entries) ?? [];
	const items = timelineQuery.data?.pages.flatMap((page) => page.items) ?? [];
	const groups = groupDiaryByDay(entries, items);

	if (groups.length === 0) {
		return (
			<Card>
				<p className="text-sm text-muted-foreground">{emptyMessage}</p>
			</Card>
		);
	}

	return (
		<div className="space-y-5">
			{groups.map((group) => (
				<section aria-label={group.label} key={group.key}>
					<h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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
			))}
			<div className="flex flex-wrap gap-2">
				{entriesQuery.hasNextPage ? (
					<Button
						disabled={entriesQuery.isFetchingNextPage}
						onClick={() => void entriesQuery.fetchNextPage()}
						variant="secondary">
						{entriesQuery.isFetchingNextPage ? 'Loading…' : 'More entries'}
					</Button>
				) : null}
				{timelineQuery.hasNextPage ? (
					<Button
						disabled={timelineQuery.isFetchingNextPage}
						onClick={() => void timelineQuery.fetchNextPage()}
						variant="secondary">
						{timelineQuery.isFetchingNextPage ? 'Loading…' : 'More activity'}
					</Button>
				) : null}
			</div>
		</div>
	);
}
