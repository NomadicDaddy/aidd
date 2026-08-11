import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { HelpTrigger } from './HelpTrigger.tsx';

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
	breadcrumb?: ReactNode;
	description?: ReactNode;
	descriptionClassName?: string;
	helpSlug?: string;
	identifier?: ReactNode;
	title: ReactNode;
}) {
	return (
		<header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
			<div className="min-w-0">
				{breadcrumb !== undefined && (
					<div className="mb-1 text-sm text-muted-foreground">{breadcrumb}</div>
				)}
				<div className="flex items-center gap-1.5">
					<h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
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
					// content column. `descriptionClassName` still overrides it — a description
					// that is a machine string rather than prose opts out with `max-w-none`.
					<p
						className={cn(
							'text-sm text-muted-foreground',
							proseMeasureClass,
							descriptionClassName,
						)}>
						{description}
					</p>
				)}
			</div>
			{actions}
		</header>
	);
}
