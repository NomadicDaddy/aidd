import type { NavCounts } from 'aidd-shared/contracts/nav-counts';

import type { NavDestinationPath } from './nav-destinations.ts';

import { toneBadge } from '../../lib/tones.ts';

export interface NavBadge {
	accessibleName: string;
	count: number;
	tone: string;
}

export type NavBadges = Partial<Record<NavDestinationPath, NavBadge>>;

/**
 * Null and undefined are the loading states, and zero is an empty list: none of the three has a
 * badge to render, so none of them has anything to announce either.
 *
 * The accessible name is the badge's whole reading. Out of context "39" says nothing, so the chip
 * is `aria-hidden` and this sentence is what a screen reader gets instead.
 */
function navBadge(
	count: null | number | undefined,
	singular: string,
	plural: string,
	tone: string,
): NavBadge | undefined {
	if (count === null || count === undefined || count <= 0) return undefined;
	return { accessibleName: `${count} ${count === 1 ? singular : plural}`, count, tone };
}

/**
 * Every count the sidebar pins to a destination, keyed by the row it belongs to.
 *
 * A map rather than a prop per badge: six counts spelled out as six props and six `item.to === …`
 * branches inside the rail's render is the same wiring written twice, and the seventh would make
 * it three times.
 *
 * Runs is the one amber badge. It counts live work and asks to be looked at, which is what amber
 * asserts on this scale; every other row counts inventory, and a raw non-zero count never
 * establishes the band amber requires. See `lib/tones.ts`.
 */
export function navBadges({
	activeExecutionCount,
	navCounts,
	projectCount,
}: {
	activeExecutionCount: number;
	navCounts: NavCounts | undefined;
	projectCount: null | number;
}): NavBadges {
	const entries: [NavDestinationPath, NavBadge | undefined][] = [
		['/audits', navBadge(navCounts?.audits, 'audit', 'audits', toneBadge.neutral)],
		[
			'/projects',
			navBadge(projectCount, 'discovered project', 'discovered projects', toneBadge.neutral),
		],
		['/recipes', navBadge(navCounts?.recipes, 'recipe', 'recipes', toneBadge.neutral)],
		[
			'/runs',
			navBadge(
				activeExecutionCount,
				'active execution',
				'active executions',
				toneBadge.amber,
			),
		],
		[
			'/scheduled',
			navBadge(
				navCounts?.scheduled,
				'active scheduled task',
				'active scheduled tasks',
				toneBadge.neutral,
			),
		],
		['/skills', navBadge(navCounts?.skills, 'skill', 'skills', toneBadge.neutral)],
	];
	const badges: NavBadges = {};
	for (const [path, badge] of entries) if (badge) badges[path] = badge;
	return badges;
}
