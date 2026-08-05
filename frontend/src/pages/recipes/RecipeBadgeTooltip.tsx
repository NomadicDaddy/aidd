import type { ReactNode } from 'react';

import { Badge } from '../../components/ui/badge.tsx';
import { Tooltip } from '../../components/ui/tooltip.tsx';
import { type Tone } from '../../lib/tones.ts';

// Matches the established badge+tooltip pattern (LocalRunResultBadges): the focus-ring
// element is the Tooltip trigger so hover, focus, and click all surface the explainer, and
// keyboard users get a visible focus ring.
const triggerClass =
	'inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none dark:focus-visible:ring-teal-300';

export function RecipeBadgeTooltip({
	children,
	content,
	tone = 'neutral',
}: {
	children: ReactNode;
	content: ReactNode;
	tone?: Tone;
}) {
	return (
		<Tooltip content={content}>
			{/* A real button rather than a tabbable span: Tooltip puts every badge in the tab order,
			    and a bare span arrives there as an unnamed generic. As a button the badge label is
			    its accessible name and the explainer is its description — Tooltip wires
			    aria-describedby while the tooltip is open. */}
			<button className={triggerClass} type="button">
				<Badge tone={tone}>{children}</Badge>
			</button>
		</Tooltip>
	);
}
