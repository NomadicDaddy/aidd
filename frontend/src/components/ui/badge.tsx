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

/**
 * The status dot, in one place.
 *
 * `Badge showDot` was already the app's only declared dot and every other dot on screen was a
 * hand-rolled `h-2 w-2` beside it — 8px against 6px, on the same page, for the same idea. The size
 * is not the interesting part; the fact that eight call sites each decided it is. Anything that
 * says "this thing is in this state" takes its dot from here.
 *
 * A chart legend swatch is NOT one of these. `TelemetrySummary` and `OutputTimeseriesChart` key a
 * series colour that the legend under them names, which is a categorical mark rather than a status,
 * and they keep their own size deliberately.
 */
export function StatusDot({
	className,
	pulse = false,
	tone = 'neutral',
}: {
	className?: string;
	pulse?: boolean;
	tone?: Tone;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
				toneSolid[tone],
				pulse && 'status-pulse',
				className,
			)}
		/>
	);
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
				'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
				'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none focus-visible:[--tw-ring-inset:initial]',
				toneBadge[tone],
				className,
			)}
			ref={ref}
			{...props}>
			{showDot && <StatusDot pulse={pulse} tone={tone} />}
			{children}
		</span>
	);
}
