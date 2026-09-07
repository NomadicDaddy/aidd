import type { ReactNode } from 'react';

import { Link } from 'react-router';

import { touchTargetRowClass } from '../../../lib/touchTarget.ts';
import { microLabelClass } from '../../../lib/typography.ts';

export function MetadataRow({
	label,
	link,
	value,
}: {
	label: string;
	link?: { ariaLabel: string; to: string };
	value: ReactNode;
}) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-1.5 text-sm max-sm:min-h-11 max-sm:items-center max-sm:py-0">
			<span className={`text-muted-foreground ${microLabelClass}`}>{label}</span>
			{/* `min-w-0`: the values are not all short strings — one is an execution identity badge
			    beside a link, another is a stack display — and without it a flex item cannot shrink
			    below its content, so in a 310px card the value pushes out of the row instead of
			    wrapping inside it. */}
			<span className="min-w-0 text-right text-foreground">
				{link ? (
					<Link
						aria-label={link.ariaLabel}
						// The row idiom, not the text one. These rows are a `divide-y` stack at
						// 33px, so the twelve pixels the text idiom borrows above and below are the
						// neighbouring rows' — and they paint over it, which is why the tap target
						// measured 11px here. `justify-end` keeps the value against the right edge
						// once the link becomes the flex box that carries the height.
						className={`rounded-sm text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none max-sm:min-w-11 max-sm:justify-end ${touchTargetRowClass}`}
						to={link.to}>
						{value}
					</Link>
				) : (
					value
				)}
			</span>
		</div>
	);
}
