import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { DiaryFeed } from './DiaryFeed.tsx';

export function DiaryPage() {
	useDocumentTitle('Diary');
	return (
		<div className="space-y-5">
			<PageHeader
				description="Cross-project narrative entries and a unified activity timeline — runs, skills, recipes, director cycles, and releases."
				title="Diary"
			/>
			<DiaryFeed emptyMessage="No diary entries or activity recorded yet." showProject />
		</div>
	);
}
