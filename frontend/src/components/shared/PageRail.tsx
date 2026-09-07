import type { ComponentPropsWithoutRef } from 'react';

import type { ContentRail } from '../../lib/contentRails.ts';

import { cn } from '../../lib/cn.ts';
import { contentRailClass, ContentRailContext } from '../../lib/contentRails.ts';

/** The single width-owning root for a page composition. */
export function PageRail({
	children,
	className,
	rail,
	...props
}: { rail: ContentRail } & ComponentPropsWithoutRef<'div'>) {
	return (
		<ContentRailContext value={rail}>
			<div
				{...props}
				className={cn(contentRailClass[rail], className)}
				data-content-rail={rail}>
				{children}
			</div>
		</ContentRailContext>
	);
}
