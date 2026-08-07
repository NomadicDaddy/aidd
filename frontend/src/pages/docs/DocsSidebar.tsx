import { NavLink } from 'react-router';

import { cn } from '../../lib/cn.ts';
import { touchTargetRowClass } from '../../lib/touchTarget.ts';
import { sectionCaptionClass } from '../../lib/typography.ts';
import { DOC_GROUP_ORDER, DOC_SECTIONS } from './docs-manifest.ts';

/**
 * Grouped navigation for the docs page, ordered by {@link DOC_GROUP_ORDER}.
 *
 * The link treatment is the shell rail's, deliberately: this nav sits about 30px from the primary
 * one, and two vertical navigations marking "you are here" two different ways read as two different
 * applications. `docs-sidebar-nav-parity.test.ts` holds the two lists together.
 *
 * One landmark per group, matching {@link SidebarNav}. The three captions were purely visual while a
 * single `<nav>` wrapped all of them: a screen reader announced sixteen undifferentiated links under
 * one name, and the words that would have separated them were plain text with no relationship to the
 * lists beneath.
 *
 * `instance` disambiguates the two copies the docs page renders at once — the compact disclosure and
 * the `lg` sidebar — since duplicate landmark names are as unhelpful as no names at all.
 */
export function DocsSidebar({ instance }: { instance?: string }) {
	return (
		<div className="space-y-5">
			{DOC_GROUP_ORDER.map((group) => {
				const sections = DOC_SECTIONS.filter((section) => section.group === group);
				if (sections.length === 0) return null;
				return (
					<nav aria-label={instance ? `${group} (${instance})` : group} key={group}>
						<div className={cn('mb-1.5 px-3', sectionCaptionClass)}>{group}</div>
						<ul className="space-y-0.5">
							{sections.map((section) => (
								<li key={section.slug}>
									<NavLink
										className={({ isActive }) =>
											cn(
												'relative flex items-center rounded-lg px-3 py-1.5 text-sm font-medium',
												// 32px at `py-1.5`, and on a phone this list is the
												// only way into the docs. The row idiom, not the
												// text one: `space-y-0.5` puts 2px between rows, so
												// anything that borrowed space above would land its
												// hit area on the section above it.
												touchTargetRowClass,
												'transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
												isActive
													? 'bg-accent-muted text-accent-muted-foreground shadow-sm'
													: 'text-muted-foreground hover:bg-muted hover:text-foreground',
											)
										}
										to={`/docs/${section.slug}`}>
										{({ isActive }) => (
											<>
												<span
													aria-hidden="true"
													className={cn(
														'absolute top-1.5 left-0 h-5 w-[3px] rounded-full bg-accent transition-opacity',
														isActive ? 'opacity-100' : 'opacity-0',
													)}
												/>
												{section.title}
											</>
										)}
									</NavLink>
								</li>
							))}
						</ul>
					</nav>
				);
			})}
		</div>
	);
}
