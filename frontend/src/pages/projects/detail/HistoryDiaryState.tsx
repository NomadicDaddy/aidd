import { default as CircleAlert } from 'lucide-react/dist/esm/icons/circle-alert';

import { Button } from '../../../components/ui/button.tsx';
import { toneText } from '../../../lib/tones.ts';

const diaryStateClass =
	'flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground';

/**
 * The diary half of the timeline reports on itself, because it is the only half that loads.
 * Features and runs arrive as props and are already on screen, so a diary load, failure, or extra
 * page has to stay legible without taking those rows away: this is a line under the filter bar
 * rather than a state for the whole tab. All four conditions read differently -- an empty diary is
 * not a pending one, and a failure says so instead of looking empty.
 */
export function DiaryLoadState({
	entryCount,
	hasNextPage,
	isError,
	isFetchingNextPage,
	isPending,
	onLoadMore,
	onRetry,
}: {
	entryCount: number;
	hasNextPage: boolean;
	isError: boolean;
	isFetchingNextPage: boolean;
	isPending: boolean;
	onLoadMore: () => void;
	onRetry: () => void;
}) {
	if (isPending) return <div className={diaryStateClass}>Loading diary entries…</div>;
	if (isError) {
		return (
			<div className={diaryStateClass} role="alert">
				<span className={`inline-flex items-center gap-1.5 font-medium ${toneText.red}`}>
					<CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
					Diary entries could not be loaded. Other events are unaffected.
				</span>
				<Button onClick={onRetry} size="compact" variant="ghost">
					Retry
				</Button>
			</div>
		);
	}
	if (entryCount === 0) {
		return <div className={diaryStateClass}>No diary entries for this project.</div>;
	}
	if (!hasNextPage) return null;
	return (
		<div className={diaryStateClass}>
			<span>{entryCount} diary entries loaded.</span>
			<Button
				disabled={isFetchingNextPage}
				onClick={onLoadMore}
				size="compact"
				variant="ghost">
				{isFetchingNextPage ? 'Loading…' : 'Load more diary entries'}
			</Button>
		</div>
	);
}
