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
					<div className="mb-1 text-sm text-muted-foreground">{breadcrumb}</div>
				)}
				<div className="flex items-center gap-1.5">
					<h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
						{title}
					</h1>
					{helpSlug !== undefined && <HelpTrigger slug={helpSlug} />}
				</div>
				{description !== undefined && (
					<p className={cn('text-sm text-muted-foreground', descriptionClassName)}>
						{description}
					</p>
				)}
			</div>
			{actions}
		</header>
	);
}
