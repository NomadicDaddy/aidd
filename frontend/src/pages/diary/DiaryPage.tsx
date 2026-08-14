import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { DiaryFeed } from './DiaryFeed.tsx';

export function DiaryPage() {
	useDocumentTitle('Diary');
	return (
		// The same `page-reveal space-y-5` shell as every other page: this page once capped itself
		// at a centered 64rem column, and at the reporter's 2321px viewport that put a ~940px band
		// of empty canvas down both sides of the page while every sibling route filled the shell —
		// the layout read as broken rather than as a deliberate reading column. The reading
		// measure is carried where it belongs, on the prose itself: rows stop at `61rem`, the
		// detail line at `68ch`, and entry markdown at the shared `46ch` measure, so filling the
		// shell widens the cards and the timestamp rail, never the line length.
		<div className="page-reveal space-y-5">
			<PageHeader
				description="Cross-project narrative entries and a unified activity timeline — runs, skills, recipes, director cycles, and releases."
				title="Diary"
			/>
			<DiaryFeed emptyMessage="No diary entries or activity recorded yet." showProject />
		</div>
	);
}
