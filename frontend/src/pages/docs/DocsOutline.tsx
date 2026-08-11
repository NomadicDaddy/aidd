import { cn } from '../../lib/cn.ts';
import { markdownHeadings } from '../../lib/markdownBlocks.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';

/**
 * The current document's own sections, as a rail beside it.
 *
 * It exists to be read, and it also does the layout's work: the article is capped at its reading
 * measure, so on a wide screen the grid released 1231px of the content column — 63% of it — to
 * nothing. A cap has to be paired with something that claims the width it gives up, or tightening
 * the measure only moves the void from inside the border to outside it.
 *
 * The ids come from the same allocator the renderer uses, so a document with two identically-named
 * sections links to the right one rather than to the first.
 *
 * Named for what it is rather than for the heading it renders: a file under `pages/` whose name ends
 * in `Page.tsx` is a route in this codebase, and `check:feature-integration` fails the gate when one
 * is not mounted in `App.tsx`.
 */
export function DocsOutline({ body }: { body: string }) {
	// Two levels is the whole outline of this documentation set: 8 `##` on getting-started and no
	// `###` anywhere in it. Deeper headings would make the rail a second copy of the article.
	const headings = markdownHeadings(body, { skipLeadingTitle: true }).filter(
		(heading) => heading.depth <= 1,
	);
	if (headings.length < 2) return null;

	return (
		<nav aria-label="On this page" className="grid gap-2">
			<span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				On this page
			</span>
			<ul className="grid gap-1 border-l border-border">
				{headings.map((heading) => (
					<li key={heading.id}>
						<a
							className={cn(
								'block border-l-2 border-transparent text-xs text-muted-foreground hover:border-accent hover:text-foreground',
								touchTargetTextClass,
								heading.depth === 0 ? 'pl-3' : 'pl-6',
							)}
							href={`#${heading.id}`}>
							{heading.text}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
