import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { Button } from '../../components/ui/button.tsx';
import { cn } from '../../lib/cn.ts';
import { microLabelClass, monoEditorMeasureClass } from '../../lib/typography.ts';

/**
 * The one log surface for the pipeline report page.
 *
 * The step-output block and the step's run console sit stacked inside the same step card but were
 * two visibly different raw neutral surfaces whose long command lines clipped off the right edge or
 * wrapped under a fixed 520px cap. Neither surface followed the theme.
 *
 * The caption is a required prop rather than an option, which is why it lives here and not at each
 * call site: two identical slabs of monospace stacked in one card are indistinguishable without one,
 * and the upper of the two was the largest element on the page carrying no visible label at all. It
 * doubles as the accessible name, so the caption and the `aria-label` cannot drift apart.
 *
 * `tabIndex={0}` is part of the surface rather than left to each call site: the element is a scroll
 * container whose content genuinely overflows, so without a tab stop a keyboard-only user can reach
 * "Show full output" and "Copy" but never the region those buttons act on.
 *
 * The cap tracks the viewport rather than being a flat pixel count. `max-h-[520px]` was written
 * against a laptop and stayed 520px on a 1309px-tall screen, where it showed half a percent of a
 * 100,000px transcript and left 789px of screen empty below it — the Audits tables already use
 * `calc(100dvh-16rem)`, which subtracts the real chrome instead of guessing at it.
 */
export function LogPre({
	caption,
	children,
	className,
	expandable = false,
	expandLabel = 'Show full output',
	expansionHint,
	id,
	meta,
	startAtEnd = false,
}: {
	caption: string;
	children: ReactNode;
	className?: string;
	/**
	 * Render the cap-release toggle under the slab.
	 *
	 * Off by default because `StepOutput` already carries a toggle of its own — that one truncates
	 * the *content* at 40 lines and releases the cap as a side effect, and two buttons saying
	 * "Show full output" under one slab is worse than either. The run console, which keeps all of
	 * its loaded content and is capped only by height, is what this is for.
	 */
	expandable?: boolean;
	/** Collapsed-state action label when the generic label would hide the expansion cost. */
	expandLabel?: string;
	/** Visible explanation of what releasing the cap will add to the document. */
	expansionHint?: ReactNode;
	id?: string;
	/** Optional right-aligned note — what the slab is a slice of, and how much of it is missing. */
	meta?: ReactNode;
	/** Move to the end when this changes to true, after the output has reached the DOM. */
	startAtEnd?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const generatedId = useId();
	const preId = id ?? generatedId;
	const expansionHintId = `${preId}-expansion-hint`;
	const metaId = `${preId}-meta`;
	const preRef = useRef<HTMLPreElement>(null);

	useLayoutEffect(() => {
		if (!startAtEnd) return;
		const node = preRef.current;
		if (node) node.scrollTop = node.scrollHeight;
	}, [startAtEnd]);

	return (
		<div className={cn('min-w-0', monoEditorMeasureClass)}>
			<div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<span className={cn(microLabelClass, 'text-muted-foreground')}>{caption}</span>
				{meta ? (
					<span className="text-xs text-muted-foreground" id={metaId}>
						{meta}
					</span>
				) : null}
			</div>
			<pre
				aria-describedby={meta ? metaId : undefined}
				aria-label={caption}
				className={cn(
					'max-h-[calc(100dvh-16rem)] w-full max-w-full overflow-auto rounded-md border border-border bg-muted p-3 text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/80',
					expandable && expanded && 'max-h-none',
					className,
				)}
				id={preId}
				ref={preRef}
				tabIndex={0}>
				{children}
			</pre>
			{expandable ? (
				<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
					<Button
						aria-controls={preId}
						aria-describedby={!expanded && expansionHint ? expansionHintId : undefined}
						aria-expanded={expanded}
						onClick={() => setExpanded((previous) => !previous)}
						variant="secondary">
						<DisclosureMarker open={expanded} />
						{expanded ? 'Collapse output' : expandLabel}
					</Button>
					{!expanded && expansionHint ? (
						<span className="text-xs text-muted-foreground" id={expansionHintId}>
							{expansionHint}
						</span>
					) : null}
				</div>
			) : null}
		</div>
	);
}
