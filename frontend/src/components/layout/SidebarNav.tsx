import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { type FocusEvent, useCallback, useLayoutEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router';

import { cn } from '../../lib/cn.ts';
import { observeOverflow } from '../../lib/observeOverflow.ts';
import { revealElementWithinScroller } from '../../lib/revealWithinScroller.ts';
import { sectionCaptionClass } from '../../lib/typography.ts';
import { activeExecutionCountAccessibleName } from './appLayoutAccessibility.ts';
import { navGroups } from './nav-items.ts';

/**
 * The shell's primary destinations: a vertical rail from `sm` up, a single horizontally scrolling
 * strip below it.
 *
 * One landmark per group rather than a single "Primary": four groups inside one nav are announced
 * as twelve undifferentiated links, and the visible group label that could name them is hidden on
 * mobile and in the collapsed rail.
 */
export function SidebarNav({
	activeExecutionCount,
	collapsed,
}: {
	activeExecutionCount: number;
	collapsed: boolean;
}) {
	const cleanupRef = useRef<(() => void) | null>(null);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const location = useLocation();

	const setRoot = useCallback((root: HTMLDivElement | null) => {
		cleanupRef.current?.();
		cleanupRef.current = null;
		rootRef.current = root;
		if (!root) return;
		const scroller = root.querySelector<HTMLElement>('[data-sidebar-nav-scrollport]');
		if (!scroller) return;

		cleanupRef.current = observeOverflow(scroller, (flags) => {
			root.dataset.overflowDown = String(flags.scrollsDown);
		});
	}, []);

	useLayoutEffect(() => {
		const scroller = rootRef.current?.querySelector<HTMLElement>(
			'[data-sidebar-nav-scrollport]',
		);
		const activeDestination = scroller?.querySelector<HTMLElement>('a[aria-current="page"]');
		if (!scroller || !activeDestination) return;
		// Keep the complete active row above the continuation cue without scrolling the page.
		revealElementWithinScroller(scroller, activeDestination, 24);
	}, [collapsed, location.pathname]);

	const revealFocusedDestination = useCallback((event: FocusEvent<HTMLDivElement>) => {
		if (!(event.target instanceof HTMLAnchorElement)) return;
		revealElementWithinScroller(event.currentTarget, event.target, 24);
	}, []);

	return (
		<div
			className="group relative -mx-1 mt-3 min-w-0 sm:mx-0 sm:mt-0 sm:flex sm:min-h-0 sm:flex-1 sm:flex-col"
			ref={setRoot}>
			{/* The mask fades the right edge below `sm`, where the strip always overflows 320px. */}
			<div
				className="flex gap-1 overflow-x-auto px-1 pb-1 max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] sm:block sm:min-h-0 sm:flex-1 sm:space-y-0.5 sm:overflow-x-visible sm:overflow-y-auto sm:px-0 sm:pr-1 sm:pb-0"
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
										'group relative flex h-11 w-11 shrink-0 items-center justify-center gap-2.5 rounded-lg px-0 text-sm font-medium sm:h-9 sm:w-auto sm:justify-start sm:px-3',
										'transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
										{item.to === '/runs' && activeExecutionCount > 0 && (
											<span
												aria-label={activeExecutionCountAccessibleName(
													activeExecutionCount,
												)}
												className={cn(
													'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-100 px-1 text-2xs font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
													collapsed
														? 'hidden'
														: 'ml-auto hidden sm:inline-flex',
												)}>
												{activeExecutionCount}
											</span>
										)}
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
