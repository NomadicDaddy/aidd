import type { HTMLAttributes, ReactNode, Ref } from 'react';

import { cn } from '../../lib/cn.ts';
import { type Tone, toneBadge, toneSolid } from '../../lib/tones.ts';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	children: ReactNode;
	pulse?: boolean;
	ref?: Ref<HTMLSpanElement> | undefined;
	showDot?: boolean;
	tone?: Tone;
}

export function Badge({
	children,
	className,
	pulse = false,
	ref,
	showDot = false,
	tone = 'neutral',
	...props
}: BadgeProps) {
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
				'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none focus-visible:[--tw-ring-inset:initial]',
				toneBadge[tone],
				className,
			)}
			ref={ref}
			{...props}>
			{showDot && (
				<span
					aria-hidden="true"
					className={cn(
						'h-1.5 w-1.5 rounded-full',
						pulse && 'status-pulse',
						toneSolid[tone],
					)}
				/>
			)}
			{children}
		</span>
	);
}
