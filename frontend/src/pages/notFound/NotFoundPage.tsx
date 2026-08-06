import { NOT_FOUND_PAGE_MARKER } from 'aidd-shared/contracts/frontend-routes';
import { Link, useLocation } from 'react-router';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';

export function NotFoundPage() {
	useDocumentTitle('Not Found');
	const location = useLocation();
	return (
		<div className="page-reveal space-y-5" data-aidd-page={NOT_FOUND_PAGE_MARKER}>
			{/* The 404 is a page like any other: the house title treatment, with the way back in the
			    breadcrumb slot so the card can hold exactly one emphasised recovery action. */}
			<PageHeader
				breadcrumb={
					<Link className="hover:text-foreground" to="/">
						Dashboard
					</Link>
				}
				description="The link may be outdated or mistyped."
				title="Page not found"
			/>
			{/* The house nothing-here block: a dashed muted inset with its recovery action in the
			    `action` slot. This was a solid Card with a filled accent button, which read as an
			    emphasised piece of content rather than as an absence — the Dashboard's equivalent
			    block, for the same situation, is this. */}
			<EmptyState
				action={
					<Link className={buttonClassName('secondary')} to="/">
						Back to Dashboard
					</Link>
				}>
				No page matches{' '}
				<code className="rounded-sm bg-background px-1 font-mono text-foreground">
					{location.pathname}
				</code>
				.
			</EmptyState>
		</div>
	);
}
