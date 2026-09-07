import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { proseMeasureClass } from '../../lib/typography.ts';

/**
 * The orienting sentence a tab opens with.
 *
 * Not a Card. A full `rounded-xl border p-4` box wrapping an h2 that restates the selected tab —
 * "Overview" under a selected Overview tab, "Features" under Features — plus one sentence costs
 * roughly 90px per tab (measured on the dependencies tab: part of a 627px chrome stack in a
 * 1309px viewport) for a border drawn around a label the tab strip has already given. The heading
 * stays for the accessibility tree, where it does real work as the panel's name; it gets no box.
 *
 * A tab whose header carries controls (Milestones has Auto-place features and New milestone) keeps
 * its Card, because there the panel is holding something.
 */
export function TabIntro({
	description,
	title,
}: {
	/** The orienting sentence. Prose, so it takes the same measure a page description does. */
	description?: ReactNode;
	/** The panel's name. Rendered for assistive tech only — the tab strip shows it visually. */
	title: string;
}) {
	return (
		<div>
			<h2 className="sr-only">{title}</h2>
			{description ? (
				<p className={cn('text-sm text-muted-foreground', proseMeasureClass)}>
					{description}
				</p>
			) : null}
		</div>
	);
}
