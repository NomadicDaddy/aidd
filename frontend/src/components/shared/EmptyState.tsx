import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';

export function EmptyState({
	action,
	children,
	className,
}: {
	action?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				'border-border bg-muted text-muted-foreground rounded-md border border-dashed p-4 text-sm',
				action ? 'flex flex-col items-start gap-2' : undefined,
				className
			)}>
			<div>{children}</div>
			{action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
		</div>
	);
}
