import { default as ArrowLeft } from 'lucide-react/dist/esm/icons/arrow-left';
import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { Link } from 'react-router';

import { cn } from '../../lib/cn.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { docsNavigationFocusClass } from './docsNavigationStyles.ts';
import { docsNeighbors } from './docsPagination.ts';

const pagerLinkClass = cn(
	touchTargetTextClass,
	'inline-flex min-w-0 items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground',
	'transition-colors duration-150 hover:text-accent',
	docsNavigationFocusClass,
);

export function DocsPager({ slug }: { slug: string }) {
	const { next, previous } = docsNeighbors(slug);
	if (next === undefined && previous === undefined) return null;

	return (
		<nav
			aria-label="Documentation pagination"
			className="mt-8 flex flex-wrap items-center gap-3 border-t border-border/60 pt-5">
			{previous !== undefined ? (
				<Link className={pagerLinkClass} to={`/docs/${previous.slug}`}>
					<ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
					<span className="truncate">Previous: {previous.title}</span>
				</Link>
			) : null}
			{next !== undefined ? (
				<Link
					className={cn(pagerLinkClass, 'ml-auto text-right')}
					to={`/docs/${next.slug}`}>
					<span className="truncate">Next: {next.title}</span>
					<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
				</Link>
			) : null}
		</nav>
	);
}
