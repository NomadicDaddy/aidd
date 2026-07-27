import { NOT_FOUND_PAGE_MARKER } from 'aidd-shared/contracts/frontend-routes';
import { default as ArrowLeft } from 'lucide-react/dist/esm/icons/arrow-left';
import { Link, useLocation } from 'react-router';

import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';

export function NotFoundPage() {
	useDocumentTitle('Not Found');
	const location = useLocation();
	return (
		<div className="space-y-5" data-aidd-page={NOT_FOUND_PAGE_MARKER}>
			<Link
				className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-neutral-50"
				to="/">
				<ArrowLeft className="h-4 w-4" />
				Dashboard
			</Link>
			<Card>
				<h1 className="text-xl font-semibold text-foreground">Page not found</h1>
				<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
					No page matches <code className="font-mono">{location.pathname}</code>. The link
					may be outdated or mistyped.
				</p>
				<div className="mt-4">
					<Link to="/">
						<Button>Back to Dashboard</Button>
					</Link>
				</div>
			</Card>
		</div>
	);
}
