import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { fieldLabelClass } from '../../lib/formStyles.ts';

/**
 * The one log surface for the pipeline report page.
 *
 * The step-output block and the step's run console sit stacked inside the same step card but were
 * two visibly different surfaces: a mid-grey `bg-neutral-100` block whose long command lines clipped
 * off the right edge with no max-height, above a near-black `bg-neutral-950` block that wrapped and
 * clipped at 520px. Both were raw neutrals, so neither re-themed.
 *
 * The caption is a required prop rather than an option, which is why it lives here and not at each
 * call site: two identical slabs of monospace stacked in one card are indistinguishable without one,
 * and the upper of the two was the largest element on the page carrying no visible label at all. It
 * doubles as the accessible name, so the caption and the `aria-label` cannot drift apart.
 *
 * `tabIndex={0}` is part of the surface rather than left to each call site: the element is a scroll
 * container whose content genuinely overflows, so without a tab stop a keyboard-only user can reach
 * "Show full output" and "Copy" but never the region those buttons act on.
 */
export function LogPre({
	caption,
	children,
	className,
	id,
	meta,
}: {
	caption: string;
	children: ReactNode;
	className?: string;
	id?: string;
	/** Optional right-aligned note — what the slab is a slice of, and how much of it is missing. */
	meta?: ReactNode;
}) {
	return (
		<div className="min-w-0">
			<div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<span className={fieldLabelClass}>{caption}</span>
				{meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
			</div>
			<pre
				aria-label={caption}
				className={cn(
					'max-h-[520px] w-full max-w-full overflow-auto rounded-md border border-border bg-muted p-3 text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
					className,
				)}
				id={id}
				tabIndex={0}>
				{children}
			</pre>
		</div>
	);
}
