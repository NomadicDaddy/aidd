import { NOT_FOUND_PAGE_MARKER } from 'aidd-shared/contracts/frontend-routes';
import { Link, useLocation } from 'react-router';

import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
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
			<Card>
				<p className="text-sm text-muted-foreground">
					No page matches{' '}
					<code className="rounded-sm bg-muted px-1 font-mono text-foreground">
						{location.pathname}
					</code>
					.
				</p>
				<div className="mt-4">
					<Link className={buttonClassName('primary')} to="/">
						Back to Dashboard
					</Link>
				</div>
			</Card>
		</div>
	);
}
