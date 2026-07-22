import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { HelpTrigger } from './HelpTrigger.tsx';

export function PageHeader({
	actions,
	breadcrumb,
	description,
	descriptionClassName,
	helpSlug,
	title,
}: {
	actions?: ReactNode;
	breadcrumb?: ReactNode;
	description?: ReactNode;
	descriptionClassName?: string;
	helpSlug?: string;
	title: ReactNode;
}) {
	return (
		<header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<div className="min-w-0">
				{breadcrumb !== undefined && (
					<div className="text-muted-foreground mb-1 text-sm">{breadcrumb}</div>
				)}
				<div className="flex items-center gap-1.5">
					<h1 className="text-foreground font-display text-2xl font-semibold tracking-tight">
						{title}
					</h1>
					{helpSlug !== undefined && <HelpTrigger slug={helpSlug} />}
				</div>
				{description !== undefined && (
					<p className={cn('text-muted-foreground text-sm', descriptionClassName)}>
						{description}
					</p>
				)}
			</div>
			{actions}
		</header>
	);
}
