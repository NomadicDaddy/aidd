import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { type Tone, toneBadge, toneSolid } from '../../lib/tones.ts';

export function Badge({
	children,
	className,
	pulse = false,
	showDot = false,
	tone = 'neutral',
}: {
	children: ReactNode;
	className?: string;
	pulse?: boolean;
	showDot?: boolean;
	tone?: Tone;
}) {
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
				toneBadge[tone],
				className,
			)}>
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
