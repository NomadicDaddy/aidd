import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { type FocusEvent, useLayoutEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router';

import type { NavBadge, NavBadges } from './navBadges.ts';

import { cn } from '../../lib/cn.ts';
import { observeOverflow } from '../../lib/observeOverflow.ts';
import { revealElementWithinScroller } from '../../lib/revealWithinScroller.ts';
import { sectionCaptionClass } from '../../lib/typography.ts';
import { navGroups } from './nav-items.ts';

const MOBILE_NAV_FADE_PX = 32;
const MOBILE_NAV_MASK = [
	'max-sm:[--fade-end:0px] max-sm:[--fade-start:0px]',
	'max-sm:data-[overflow-start=true]:[--fade-start:2rem]',
	'max-sm:data-[overflow-end=true]:[--fade-end:2rem]',
	'max-sm:[mask-image:linear-gradient(to_right,transparent,black_var(--fade-start),black_calc(100%-var(--fade-end)),transparent)]',
].join(' ');

/**
 * A count pinned to the end of a destination row. Hidden in the collapsed rail and below `sm`,
 * where the row is an icon with no room beside it.
 *
 * The number itself is `aria-hidden`: out of context "39" says nothing, so the sr-only sibling
 * carries the reading instead.
 */
function NavCountBadge({ badge, collapsed }: { badge: NavBadge | undefined; collapsed: boolean }) {
	if (!badge) return null;
	return (
		<>
			<span
				aria-hidden="true"
				className={cn(
					'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-2xs font-bold',
					badge.tone,
					collapsed ? 'hidden' : 'ml-auto hidden sm:inline-flex',
				)}>
				{badge.count}
			</span>
			<span className="sr-only">{badge.accessibleName}</span>
		</>
	);
}

/**
 * The shell's primary destinations: a vertical rail from `sm` up, a single horizontally scrolling
 * strip below it.
 *
 * One landmark per group rather than a single "Primary": four groups inside one nav are announced
 * as twelve undifferentiated links, and the visible group label that could name them is hidden on
 * mobile and in the collapsed rail.
 */
export function SidebarNav({ badges, collapsed }: { badges: NavBadges; collapsed: boolean }) {
	const cleanupRef = useRef<(() => void) | null>(null);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const location = useLocation();

	const setRoot = (root: HTMLDivElement | null) => {
		cleanupRef.current?.();
		cleanupRef.current = null;
		rootRef.current = root;
		if (!root) return;
		const scroller = root.querySelector<HTMLElement>('[data-sidebar-nav-scrollport]');
		if (!scroller) return;

		cleanupRef.current = observeOverflow(scroller, (flags) => {
			scroller.dataset.overflowEnd = String(flags.end);
			scroller.dataset.overflowStart = String(flags.start);
			root.dataset.overflowDown = String(flags.scrollsDown);
		});
	};

	useLayoutEffect(() => {
		const scroller = rootRef.current?.querySelector<HTMLElement>(
			'[data-sidebar-nav-scrollport]',
		);
		const activeDestination = scroller?.querySelector<HTMLElement>('a[aria-current="page"]');
		if (!scroller || !activeDestination) return;
		// Keep the destination clear of either mobile fade and the desktop continuation cue.
		revealElementWithinScroller(
			scroller,
			activeDestination,
			24,
			MOBILE_NAV_FADE_PX,
			MOBILE_NAV_FADE_PX,
		);
	}, [collapsed, location.pathname]);

	const revealFocusedDestination = (event: FocusEvent<HTMLDivElement>) => {
		if (!(event.target instanceof HTMLAnchorElement)) return;
		revealElementWithinScroller(
			event.currentTarget,
			event.target,
			24,
			MOBILE_NAV_FADE_PX,
			MOBILE_NAV_FADE_PX,
		);
	};

	return (
		<div
			className="group relative -mx-1 mt-3 min-w-0 sm:mx-0 sm:mt-0 sm:flex sm:min-h-0 sm:flex-1 sm:flex-col"
			ref={setRoot}>
			{/* Below `sm`, fade only the edges that still have destinations beyond them. */}
			<div
				className={cn(
					'flex gap-1 overflow-x-auto px-1 pb-1 sm:block sm:min-h-0 sm:flex-1 sm:space-y-0.5 sm:overflow-x-visible sm:overflow-y-auto sm:px-0 sm:pr-1 sm:pb-0',
					MOBILE_NAV_MASK,
				)}
				data-sidebar-nav-scrollport=""
				onFocus={revealFocusedDestination}>
				{navGroups.map((group, groupIndex) => (
					<nav aria-label={group.label} className="contents sm:block" key={group.label}>
						{!collapsed && (
							<div
								className={cn(
									'hidden px-3 sm:block',
									sectionCaptionClass,
									groupIndex === 0 ? 'mt-0' : 'mt-5',
									'mb-1.5',
								)}>
								{group.label}
							</div>
						)}
						{groupIndex > 0 && (
							<>
								{/* Mobile keeps the four groups legible in one strip. */}
								<span
									aria-hidden="true"
									className="h-5 w-px shrink-0 self-center rounded-full bg-border/60 sm:hidden"
								/>
								{collapsed && (
									<div
										aria-hidden="true"
										className="mx-auto my-2 hidden h-px w-6 rounded-full bg-border/60 sm:block"
									/>
								)}
							</>
						)}
						{group.items.map((item) => (
							<NavLink
								className={({ isActive }) =>
									cn(
										// `sm:overflow-hidden`: `collapsed` flips the labels back
										// on instantly while the rail's width animates over 200ms,
										// so on the way out of the icon rail a label is briefly
										// laid out in a 64px box. Without this it painted ~57px
										// past the rail's right edge, across the page beside it.
										'group relative flex h-11 w-11 shrink-0 items-center justify-center gap-2.5 rounded-lg px-0 text-sm font-medium sm:h-9 sm:w-auto sm:justify-start sm:overflow-hidden sm:px-3',
										'transition-[color,background-color,border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
										isActive
											? 'bg-accent-muted text-accent-muted-foreground shadow-sm dark:bg-accent-muted dark:text-accent-muted-foreground'
											: 'text-muted-foreground hover:bg-muted hover:text-foreground',
									)
								}
								key={item.to}
								title={item.label}
								to={item.to}>
								{({ isActive }) => (
									<>
										<span
											aria-hidden="true"
											className={cn(
												'absolute top-1.5 left-0 hidden h-6 w-[3px] rounded-full bg-accent transition-opacity sm:block',
												isActive ? 'opacity-100' : 'opacity-0',
											)}
										/>
										<item.icon className="h-4 w-4 shrink-0" />
										<span
											className={
												collapsed
													? 'sr-only'
													: 'sr-only sm:not-sr-only sm:inline'
											}>
											{item.label}
										</span>
										<NavCountBadge
											badge={badges[item.to]}
											collapsed={collapsed}
										/>
									</>
								)}
							</NavLink>
						))}
					</nav>
				))}
			</div>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute right-1 bottom-0 left-0 z-10 hidden h-6 items-end justify-center border-b border-accent/50 bg-card/95 pb-0.5 text-accent opacity-0 transition-opacity duration-200 group-data-[overflow-down=true]:opacity-100 sm:flex"
				data-sidebar-continuation="">
				<ChevronDown className="h-3.5 w-3.5" />
			</span>
		</div>
	);
}
