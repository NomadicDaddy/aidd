import { NavLink } from 'react-router';

import { cn } from '../../lib/cn.ts';
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
	return (
		// The mask fades the right edge below `sm`, where the strip always overflows 320px.
		<div className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1 max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] sm:mx-0 sm:mt-0 sm:block sm:min-h-0 sm:flex-1 sm:space-y-0.5 sm:overflow-x-visible sm:overflow-y-auto sm:px-0 sm:pr-1 sm:pb-0">
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
	);
}
