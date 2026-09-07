import type { ProjectFeature } from '../../../api/types.ts';

import { stringValue } from './shared.ts';

/** The seam cast by the right-pinned Actions track over columns scrolling beneath its left edge. */
export const featureActionEdgeClass =
	'shadow-[inset_8px_0_8px_-8px_rgba(0,0,0,0.35)] border-l border-control-border';

/**
 * The action track, and the table floor that goes with it.
 *
 * Actions carries up to five controls and is what sets the row height, so its width is decided by
 * which statuses happen to be on the page. Approval controls wrap inside a bounded 20rem track;
 * they must not take 27rem from every ordinary row just because one approval happens to be visible.
 * At narrower desktop content widths Source and the two dates hide, leaving Feature, lifecycle,
 * milestone, priority, and pinned Actions co-visible. The full inventory returns at 88rem.
 */
export function featureActionTrack(rows: ProjectFeature[]): { column: string; table: string } {
	const status = (feature: ProjectFeature): string => stringValue(feature, 'status');
	if (rows.some((feature) => ['backlog', 'waiting_approval'].includes(status(feature)))) {
		return { column: 'w-80', table: 'min-w-[71rem] @min-[88rem]:min-w-[88rem]' };
	}
	if (rows.some((feature) => status(feature) === 'in_progress')) {
		return { column: 'w-64', table: 'min-w-[67rem] @min-[88rem]:min-w-[84rem]' };
	}
	return { column: 'w-36', table: 'min-w-[60rem] @min-[88rem]:min-w-[77rem]' };
}
