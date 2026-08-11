import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { DiaryFeed } from './DiaryFeed.tsx';

export function DiaryPage() {
	useDocumentTitle('Diary');
	return (
		// The cap belongs to the page, not to the feed alone. `DiaryFeed` capped itself at
		// `max-w-5xl` while the PageHeader above it ran the full shell width, so at 2250 the header
		// spanned 1962px and everything under it stopped at 1024px flush left — a continuous 938px
		// band of empty canvas down the right of the page that read as a broken layout rather than a
		// reading column. Capping here puts the header on the same column as the feed, and
		// `mx-auto` splits what is left over symmetrically. The project Diary tab is unaffected: it
		// asks the feed for the full variant and has its own header card setting the column.
		<div className="page-reveal mx-auto w-full max-w-5xl space-y-5">
			<PageHeader
				description="Cross-project narrative entries and a unified activity timeline — runs, skills, recipes, director cycles, and releases."
				title="Diary"
			/>
			<DiaryFeed emptyMessage="No diary entries or activity recorded yet." showProject />
		</div>
	);
}
