import { NavLink } from 'react-router-dom';

import { cn } from '../../lib/cn.ts';
import { DOC_GROUP_ORDER, DOC_SECTIONS } from './docs-manifest.ts';

/** Grouped navigation for the docs page, ordered by {@link DOC_GROUP_ORDER}. */
export function DocsSidebar() {
	return (
		<nav aria-label="Documentation sections" className="space-y-5">
			{DOC_GROUP_ORDER.map((group) => {
				const sections = DOC_SECTIONS.filter((section) => section.group === group);
				if (sections.length === 0) return null;
				return (
					<div key={group}>
						<div className="mb-1.5 px-2 text-[0.65rem] font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-500">
							{group}
						</div>
						<ul className="space-y-0.5">
							{sections.map((section) => (
								<li key={section.slug}>
									<NavLink
										className={({ isActive }) =>
											cn(
												'block rounded-md px-2 py-1.5 text-sm transition-colors',
												isActive
													? 'bg-cyan-50 font-medium text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200'
													: 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-slate-800/60'
											)
										}
										to={`/docs/${section.slug}`}>
										{section.title}
									</NavLink>
								</li>
							))}
						</ul>
					</div>
				);
			})}
		</nav>
	);
}
