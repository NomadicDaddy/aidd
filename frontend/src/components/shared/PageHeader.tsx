import type { ReactNode } from 'react';

import { default as ArrowLeft } from 'lucide-react/dist/esm/icons/arrow-left';
import { Link } from 'react-router';

import { cn } from '../../lib/cn.ts';
import { useContentRail } from '../../lib/contentRails.ts';
import { linkFocusClass } from '../../lib/focusStyles.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { HelpTrigger } from './HelpTrigger.tsx';

interface PageHeaderBreadcrumb {
	label: ReactNode;
	to: string;
}

const breadcrumbLinkClass = cn(
	touchTargetTextClass,
	'inline-flex items-center gap-1 rounded-sm underline-offset-2 hover:underline',
	linkFocusClass,
);

/**
 * `identifier` mirrors `CardHeader`'s slot of the same name and emits the same line: the mono
 * machine string that names the record, under its human title.
 *
 * It exists because detail pages were the one place a resource's id disappeared. The Recipes
 * catalog prints `apply-ui` twice in mono — once under each card title, once in the table — and
 * then its own detail page showed only the name, `apply ui`, in Space Grotesk. The id was present
 * everywhere except on the record it names.
 */
export function PageHeader({
	actions,
	breadcrumb,
	description,
	descriptionClassName,
	helpSlug,
	identifier,
	title,
}: {
	actions?: ReactNode;
	breadcrumb?: PageHeaderBreadcrumb;
	description?: ReactNode;
	descriptionClassName?: string;
	helpSlug?: string;
	identifier?: ReactNode;
	title: ReactNode;
}) {
	const rail = useContentRail();
	return (
		<header className="@container relative z-10" data-content-rail={rail}>
			{breadcrumb !== undefined && (
				<div className="mb-4 text-sm text-muted-foreground">
					<Link className={breadcrumbLinkClass} to={breadcrumb.to}>
						<ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
						{breadcrumb.label}
					</Link>
				</div>
			)}
			<div className="flex flex-col gap-2 @min-[61rem]:flex-row @min-[61rem]:items-start @min-[61rem]:justify-between @min-[61rem]:gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-1.5">
						<h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
							{title}
						</h1>
						{helpSlug !== undefined && <HelpTrigger slug={helpSlug} />}
					</div>
					{identifier !== undefined && (
						<p className="mt-1 truncate font-mono text-xs text-muted-foreground">
							{identifier}
						</p>
					)}
					{description !== undefined && (
						// The measure is the default rather than each page's decision: a page
						// description is running prose, and at 2250px wide it otherwise ran the full
						// content column. A page can supply `descriptionClassName` for a machine
						// string, which opts out without restating a page-rail class.
						<p
							className={cn(
								'text-sm leading-relaxed text-muted-foreground',
								descriptionClassName === undefined && proseMeasureClass,
								descriptionClassName,
							)}>
							{description}
						</p>
					)}
				</div>
				{actions}
			</div>
		</header>
	);
}
