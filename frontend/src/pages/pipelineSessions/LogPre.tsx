import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';

/**
 * The one log surface for the pipeline report page.
 *
 * The step-output block and the step's run console sit stacked inside the same step card but were
 * two visibly different surfaces: a mid-grey `bg-neutral-100` block whose long command lines clipped
 * off the right edge with no max-height, above a near-black `bg-neutral-950` block that wrapped and
 * clipped at 520px. Both were raw neutrals, so neither re-themed.
 *
 * `tabIndex={0}` is part of the surface rather than left to each call site: the element is a scroll
 * container whose content genuinely overflows, so without a tab stop a keyboard-only user can reach
 * "Show full output" and "Copy" but never the region those buttons act on.
 */
export function LogPre({
	ariaLabel,
	children,
	className,
	id,
}: {
	ariaLabel: string;
	children: ReactNode;
	className?: string;
	id?: string;
}) {
	return (
		<pre
			aria-label={ariaLabel}
			className={cn(
				'max-h-[520px] w-full max-w-full overflow-auto rounded-md border border-border bg-muted p-3 text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
				className,
			)}
			id={id}
			tabIndex={0}>
			{children}
		</pre>
	);
}
