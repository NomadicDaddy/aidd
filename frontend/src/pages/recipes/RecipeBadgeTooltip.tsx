import type { ReactNode } from 'react';

import { Badge } from '../../components/ui/badge.tsx';
import { Tooltip } from '../../components/ui/tooltip.tsx';
import { type Tone } from '../../lib/tones.ts';
import { touchTargetCompactBoxClass } from '../../lib/touchTarget.ts';

// Matches the established badge+tooltip pattern (LocalRunResultBadges): the focus-ring
// element is the Tooltip trigger so hover, focus, and click all surface the explainer, and
// keyboard users get a visible focus ring.
// The ring is the same half-strength token pairing `formControlClass` uses. A /20 ring is only
// 1.55:1 against a dark card and disappears once the global outline is suppressed here.
// The mobile minimums enlarge the button box without changing Badge's compact padding or type.
// These triggers appear as one policy-summary row on the recipe editor rather than as catalog
// controls; catalog callers use `plain`, so the hundreds of read-only chips stay outside the tab
// order and do not inherit this touch area.
const triggerClass = `${touchTargetCompactBoxClass} items-center justify-center rounded-md focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:outline-none`;

export function RecipeBadgeTooltip({
	children,
	content,
	plain = false,
	tone = 'neutral',
}: {
	children: ReactNode;
	/** A plain string, because a `plain` badge carries it on `title`. */
	content: string;
	/**
	 * Render the badge outside the tab order, with the explainer on `title`.
	 *
	 * A tab stop per chip is right where a single recipe's badges are the content, and wrong on a
	 * catalog of them. Counted live on the loaded list at 2250x1309, `main` held 314 focusable
	 * elements and 198 of them were tooltip-only badge buttons, so reaching the Launch control of a
	 * recipe near the bottom cost roughly 300 tab stops of which none but the last few did
	 * anything. Thirty-six cards' worth of chips are decoration around the two controls that act,
	 * and the explainer they carry is one click away on the recipe's own page. Hover still answers
	 * the question in place.
	 */
	plain?: boolean;
	tone?: Tone;
}) {
	if (plain) {
		return (
			<Badge title={content || undefined} tone={tone}>
				{children}
			</Badge>
		);
	}
	return (
		<Tooltip content={content}>
			{/* A real button rather than a tabbable span: this explainer belongs in the tab order,
			    and a bare span would arrive there as an unnamed generic. As a button the badge label is
			    its accessible name and the explainer is its description — Tooltip wires
			    aria-describedby while the tooltip is open. */}
			<button className={triggerClass} type="button">
				<Badge tone={tone}>{children}</Badge>
			</button>
		</Tooltip>
	);
}
