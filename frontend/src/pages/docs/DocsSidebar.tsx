import { NavLink } from 'react-router';

import { DOC_SECTIONS, DOCS_SIDEBAR_GROUPS } from '../../components/shared/docs/docs-manifest.ts';
import { Card } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import { touchTargetRowClass } from '../../lib/touchTarget.ts';
import { sectionCaptionClass } from '../../lib/typography.ts';
import { docsCurrentLocationClass, docsNavigationFocusClass } from './docsNavigationStyles.ts';

/**
 * Documentation-owned wayfinding for the docs page.
 *
 * The application shell already links to every documented page. This rail therefore carries only
 * destinations the shell cannot provide: the entry guide, pipeline-session guide, FAQ, and
 * glossary. The pager follows this same visible sequence; route-specific documents remain
 * reachable from their contextual help buttons without creating an unselected rail state.
 *
 * The selected document keeps semantic current state and an accent indicator without copying the
 * shell's filled primary selection. One named landmark per documentation group preserves the
 * relationship between each caption and its links without duplicating shell landmark names.
 *
 * `instance` disambiguates the two copies the docs page renders at once — the compact disclosure and
 * the wide sidebar — since duplicate landmark names are as unhelpful as no names at all.
 */
export function DocsSidebar({ framed = false, instance }: { framed?: boolean; instance?: string }) {
	const groups = (
		<>
			{DOCS_SIDEBAR_GROUPS.map((group) => {
				const slugs: readonly string[] = group.slugs;
				const sections = DOC_SECTIONS.filter((section) => slugs.includes(section.slug));
				if (sections.length === 0) return null;
				return (
					<nav
						aria-label={instance ? `${group.label} (${instance})` : group.label}
						key={group.label}>
						{sections.length > 1 ? (
							/*
							 * `text-foreground` over the token's muted default, because muted is
							 * exactly what the links beside it are. Measured at 2250x1309, the
							 * caption and an unselected link shared a colour (#9ca3af), a left
							 * edge (277px) and a width (198px), and differed only by 2px of type
							 * size and one weight step — the caption being the heavier of the two.
							 * Two of the four rows in this rail were captions, and the owner read
							 * them as the most prominent links in the list and clicked them.
							 *
							 * Every other navigation group in the app uses this same token and is
							 * legible anyway, because its links carry icons: the shell rail and the
							 * docs pager are 100% icon-bearing, and a caption has no icon. These
							 * two docs rails are the app's only icon-less consumers, so the colour
							 * is the whole separation and it was not being spent.
							 */
							<div
								className={cn(
									'mb-1.5 px-3',
									sectionCaptionClass,
									'text-foreground',
								)}>
								{group.label}
							</div>
						) : null}
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
												'transition-[color,background-color,border-color,box-shadow] duration-150',
												docsNavigationFocusClass,
												isActive
													? docsCurrentLocationClass
													: 'text-muted-foreground hover:bg-muted hover:text-foreground',
											)
										}
										to={`/docs/${section.slug}`}>
										{({ isActive }) => (
											<>
												<span
													aria-hidden="true"
													className={cn(
														'absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent transition-opacity',
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
		</>
	);

	// The framed copy is the wide sidebar: a nested panel beside the article card, so it
	// takes the declared sunken variant instead of a locally invented border and radius.
	// The compact copy inside the disclosure is not a panel and stays unframed.
	if (!framed) return <div className="space-y-5">{groups}</div>;
	return (
		<Card className="grid gap-5 p-3" variant="sunken">
			{groups}
		</Card>
	);
}
