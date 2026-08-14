import { default as PenLine } from 'lucide-react/dist/esm/icons/pen-line';

import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useDiaryEntries, useWriteDiaryEntry } from '../../../hooks/useDiary.ts';
import { useNow } from '../../../hooks/useNow.ts';
import { proseMeasureClass } from '../../../lib/typography.ts';
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
			{/* Carded and capped to a reading measure, matching the Repository tab: this ran the
			    full ~1130px content width at the app's smallest step, for the one paragraph on the
			    tab that is actually prose. */}
			<Card>
				<CardHeader
					action={
						<Button
							disabled={writeEntry.isPending}
							onClick={() => writeEntry.mutate()}
							variant="primary">
							<PenLine className="h-4 w-4" />
							{writeEntry.isPending ? 'Starting…' : actionLabel}
						</Button>
					}
					actionLayout="stacked"
					className="mb-0"
					description={
						// The declared measure, not Tailwind's built-in `max-w-prose`. At 2250 this
						// wrapped near 603px while the diary prose three rows below it wrapped
						// near 631px: two reading measures in one viewport, in one face and one
						// colour, differing by just enough to look like a mistake.
						<span className={`block text-sm ${proseMeasureClass}`}>
							One narrative entry per day, written from this project’s runs, commits,
							and feature activity and interleaved with the day’s timeline. Re-running
							updates today’s entry in place, and a day with no new activity to ingest
							produces no entry.
						</span>
					}
					title="Dev diary"
				/>
			</Card>
			{/* Full width, like every sibling tab. The feed fills its container by default now; the
			    rows and the prose inside them carry their own measures. */}
			<DiaryFeed
				emptyMessage="No diary entries yet — write today’s entry to get started."
				projectPath={projectPath}
			/>
		</div>
	);
}
