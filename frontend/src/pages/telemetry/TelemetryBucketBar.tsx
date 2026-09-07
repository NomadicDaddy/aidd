import type { ReactNode } from 'react';

import { Tooltip } from '../../components/ui/tooltip.tsx';
import { cn } from '../../lib/cn.ts';

/**
 * One time-bucket column. Phone plots keep the visual bar but remove the individual interaction:
 * 24 hourly buckets cannot each own a 44px target inside the available plot width. The complete
 * values remain in the chart's semantic table. From `sm` up, the exact-value tooltip button keeps
 * the existing pointer and keyboard path.
 */
export function TelemetryBucketBar({
	children,
	className,
	label,
}: {
	children: ReactNode;
	className?: string;
	label: string;
}) {
	const bucketClass = cn(
		'flex h-full w-full flex-col rounded-sm border border-transparent',
		className,
	);
	return (
		<>
			<div aria-hidden="true" className={cn(bucketClass, 'sm:hidden')}>
				{children}
			</div>
			<div className="hidden h-full w-full sm:flex [&>span]:h-full [&>span]:w-full">
				<Tooltip content={label}>
					<button
						aria-label={label}
						className={cn(
							'group min-h-11 min-w-11 outline-none sm:min-h-0 sm:min-w-0',
							bucketClass,
						)}
						type="button">
						{children}
					</button>
				</Tooltip>
			</div>
		</>
	);
}
