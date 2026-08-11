import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { proseMeasureClass } from '../../lib/typography.ts';

/**
 * The orienting sentence a tab opens with.
 *
 * It used to be a full `rounded-xl border p-4` Card wrapping nothing but an h2 restating the
 * selected tab and one sentence: "Overview" under a selected Overview tab, "Features" under
 * Features. Measured on the dependencies tab that panel was part of a 627px chrome stack in a
 * 1309px viewport, so roughly 90px of every tab went to a border drawn around a label the tab strip
 * had already given. The heading stays for the accessibility tree, where it does real work as the
 * panel's name; only its box is gone.
 *
 * A tab whose header carries controls (Milestones has Auto-place features and New milestone) keeps
 * its Card, because there the panel is holding something.
 */
export function TabIntro({
	description,
	title,
}: {
	/** The orienting sentence. Prose, so it takes the same measure a page description does. */
	description: ReactNode;
	/** The panel's name. Rendered for assistive tech only — the tab strip shows it visually. */
	title: string;
}) {
	return (
		<div>
			<h2 className="sr-only">{title}</h2>
			<p className={cn('text-sm text-muted-foreground', proseMeasureClass)}>{description}</p>
		</div>
	);
}
