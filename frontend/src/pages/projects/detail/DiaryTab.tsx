import { default as PenLine } from 'lucide-react/dist/esm/icons/pen-line';

import { TabIntro } from '../../../components/shared/TabIntro.tsx';
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
		<div>
			{/* The project tab follows the same bounded measure as its siblings. Prose inside each
			    entry keeps its own reading cap; widening the feed gives metadata and controls room. */}
			<DiaryFeed
				activityDisclosureLimit={8}
				emptyMessage="No diary entries yet — write today’s entry to get started."
				filterAction={
					<Button
						disabled={writeEntry.isPending}
						onClick={() => writeEntry.mutate()}
						variant="primary">
						<PenLine className="h-4 w-4" />
						{writeEntry.isPending ? 'Starting…' : actionLabel}
					</Button>
				}
				filterHeader={<TabIntro title="Diary" />}
				projectPath={projectPath}
			/>
		</div>
	);
}
