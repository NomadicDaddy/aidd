import { NOT_FOUND_PAGE_MARKER } from 'aidd-shared/contracts/frontend-routes';
import { Link } from 'react-router';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { proseMeasureCardClass } from '../../lib/typography.ts';
import { DEFAULT_DOC_SLUG } from './docs-manifest.ts';
import { DocsNavigationRail } from './DocsNavigationRail.tsx';

const PAGE_RAIL = pageRailByContentType.reading;
const DOCS_GRID_CLASS = 'grid gap-6 @min-[45rem]:grid-cols-[14rem_minmax(0,1fr)]';

export function DocsNotFound({ slug }: { slug: string }) {
	return (
		<PageRail
			className="page-reveal @container space-y-5"
			data-aidd-page={NOT_FOUND_PAGE_MARKER}
			rail={PAGE_RAIL}>
			<div className={DOCS_GRID_CLASS}>
				<div className="@min-[45rem]:col-start-2 @min-[45rem]:border @min-[45rem]:border-transparent @min-[45rem]:px-6">
					<PageHeader
						breadcrumb={{ label: 'Docs', to: `/docs/${DEFAULT_DOC_SLUG}` }}
						description="The section may have been removed, or the link may be incorrect."
						title="Documentation section not found"
					/>
				</div>
			</div>
			<div className={DOCS_GRID_CLASS}>
				<DocsNavigationRail />
				<EmptyState
					action={
						<Link
							className={buttonClassName('primary')}
							to={`/docs/${DEFAULT_DOC_SLUG}`}>
							Back to Getting started
						</Link>
					}
					className={`${proseMeasureCardClass} @min-[45rem]:col-start-2`}>
					No documentation section matches “{slug}”.
				</EmptyState>
			</div>
		</PageRail>
	);
}
