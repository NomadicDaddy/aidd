import { default as PenLine } from 'lucide-react/dist/esm/icons/pen-line';

import { Button } from '../../../components/ui/button.tsx';
import { useDiaryEntries, useWriteDiaryEntry } from '../../../hooks/useDiary.ts';
import { useNow } from '../../../hooks/useNow.ts';
import { DiaryFeed } from '../../diary/DiaryFeed.tsx';
import { dayKeyFromMs, hasEntryForDay } from '../../diary/diaryItems.ts';

export function DiaryTab({ projectPath }: { projectName: string; projectPath: string }) {
	const writeEntry = useWriteDiaryEntry(projectPath);
	const entriesQuery = useDiaryEntries(projectPath);
	const entries = entriesQuery.data?.pages.flatMap((page) => page.entries) ?? [];
	const hasTodayEntry = hasEntryForDay(entries, dayKeyFromMs(useNow(false)));
	const actionLabel = hasTodayEntry ? 'Update today’s entry' : 'Write today’s entry';

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h2 className="text-foreground text-sm font-semibold">Dev diary</h2>
					<p className="text-xs text-neutral-500">
						One narrative entry per day, written from this project&apos;s runs, commits,
						and feature activity and interleaved with the day&apos;s timeline.
						Re-running updates today&apos;s entry in place, and a day with no new
						activity to ingest produces no entry.
					</p>
				</div>
				<Button
					disabled={writeEntry.isPending}
					onClick={() => writeEntry.mutate()}
					variant="primary">
					<PenLine className="h-4 w-4" />
					{writeEntry.isPending ? 'Starting…' : actionLabel}
				</Button>
			</div>
			<DiaryFeed
				emptyMessage="No diary entries yet — write today’s entry to get started."
				projectPath={projectPath}
			/>
		</div>
	);
}
