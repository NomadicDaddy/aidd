import { NOT_FOUND_PAGE_MARKER } from 'aidd-shared/contracts/frontend-routes';
import { Link, useLocation } from 'react-router';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { machineTextBreakClass, smallProseInsetMeasureClass } from '../../lib/typography.ts';

const PAGE_RAIL = pageRailByContentType.reading;

export function NotFoundPage() {
	useDocumentTitle('Not Found');
	const location = useLocation();
	return (
		<PageRail
			className="page-reveal space-y-5"
			data-aidd-page={NOT_FOUND_PAGE_MARKER}
			rail={PAGE_RAIL}>
			{/* The 404 is a page like any other: the house title treatment, with the way back in the
			    breadcrumb slot so the card can hold exactly one emphasised recovery action. */}
			<PageHeader
				breadcrumb={{ label: 'Dashboard', to: '/' }}
				description="The link may be outdated or mistyped."
				title="Page not found"
			/>
			{/* The house nothing-here block: a dashed muted inset with its recovery action in the
			    `action` slot. This was a solid Card with a filled accent button, which read as an
			    emphasised piece of content rather than as an absence — the Dashboard's equivalent
			    block, for the same situation, is this. */}
			{/* Capped at the reading measure. A dashed border is a device for marking an absence, and
			    at 2250x1309 this one drew a 1962px frame around a 490px sentence — roughly 1440px of
			    empty dashed box, so the emphasis read as the box rather than as the message. */}
			<EmptyState
				action={
					<>
						<Link className={buttonClassName('primary')} to="/">
							Go to dashboard
						</Link>
						<Link className={buttonClassName('secondary')} to="/docs">
							Browse the docs
						</Link>
					</>
				}
				className={`${smallProseInsetMeasureClass} max-sm:gap-6`}>
				{/* Box-decoration cloning keeps a wrapped pathname one selectable value while giving
				    every painted line complete padding and corners. */}
				No page is registered at{' '}
				<code
					className={`rounded-sm bg-background box-decoration-clone px-1 py-0.5 font-mono text-foreground ${machineTextBreakClass}`}>
					{location.pathname}
				</code>{' '}
				on this instance.
			</EmptyState>
		</PageRail>
	);
}
