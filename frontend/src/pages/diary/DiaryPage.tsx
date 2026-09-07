import { Link } from 'react-router';

import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { DiaryFeed } from './DiaryFeed.tsx';

const PAGE_RAIL = pageRailByContentType.data;

export function DiaryPage() {
	useDocumentTitle('Diary');
	return (
		// The record feed uses the data rail; prose keeps its own measure inside each row or card.
		<PageRail className="page-reveal space-y-5" rail={PAGE_RAIL}>
			<PageHeader
				actions={
					<Link
						className={buttonClassName('secondary')}
						to="/scheduled?preset=diary&type=skill&id=diary-entry">
						Schedule diary
					</Link>
				}
				description="Cross-project narrative entries and a unified activity timeline — runs, skills, recipes, director cycles, and releases."
				title="Diary"
			/>
			<DiaryFeed emptyMessage="No diary entries or activity recorded yet." showProject />
		</PageRail>
	);
}
