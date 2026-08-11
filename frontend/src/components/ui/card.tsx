import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { toneText, toneTextHoverStrong } from '../../lib/tones.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { proseMeasureClass } from '../../lib/typography.ts';

type CardVariant = 'default' | 'panel' | 'sunken';

const variants: Record<CardVariant, string> = {
	default: 'border-border bg-card shadow-sm',
	panel: 'border-border/80 bg-card/95 shadow-[0_12px_32px_rgba(0,0,0,0.06)] backdrop-blur-sm dark:bg-card/90 dark:shadow-[0_12px_32px_rgba(0,0,0,0.3)]',
	sunken: 'border-border/80 bg-muted/90 shadow-inner',
};

export function Card({
	'aria-labelledby': ariaLabelledBy,
	children,
	className,
	interactive = false,
	variant = 'default',
}: {
	'aria-labelledby'?: string;
	children: ReactNode;
	className?: string;
	interactive?: boolean;
	variant?: CardVariant;
}) {
	return (
		<div
			aria-labelledby={ariaLabelledBy}
			className={cn(
				'rounded-xl border p-4 transition-[border-color,background-color,box-shadow] duration-200',
				variants[variant],
				interactive && 'card-hover hover:border-accent/40',
				className,
			)}>
			{children}
		</div>
	);
}

// Two visual steps, and only two. A section title and the subsection titles under it have to be
// told apart at a glance, but a third step would be indistinguishable from the second at these
// sizes and would only invite each page to pick its own.
const headerLevels = {
	section: 'text-base font-semibold text-foreground',
	subsection: 'text-sm font-semibold text-foreground',
} as const;

/**
 * Canonical card/section header: the single declaration of card-title typography and of how the
 * icon, title, identifier, badge, description and action slots relate to each other.
 *
 * Every slot is optional so a consumer can render just what it has without inventing a variant.
 * `identifier` is the mono line under the title — a recipe id, a skill id, a file path — and it
 * exists because its absence is what made Recipes and Skills hand-roll their own header instead.
 *
 * `headingLevel` and `level` are deliberately independent. The first is semantics: a card nested
 * under an `h2` section emits `h3` so heading order stays contiguous for screen readers. The second
 * is typography. They usually agree, but a page may need an `h3` that still reads as a top-level
 * section, and pinning one to the other would force it to choose between the two.
 *
 * Page-level and document headings are not this component's business; those use `PageHeader` and
 * `MarkdownContent`.
 *
 * A caller that wants the *card* to own the vertical rhythm passes `className="mb-0"` here to drop
 * the `mb-4` below. That is correct only when the Card spaces with `gap`. It is a bug when the Card
 * spaces with `space-y-*`: Tailwind v4 compiles that to
 * `:where(.space-y-3 > :not(:last-child)) { margin-block-end: … }`, which lands on this header —
 * a non-last child — at zero specificity, so `mb-0` cancels the card's whole rhythm and the
 * description butts against the first row at 0px. Nineteen cards were spaced that way and every one
 * of them measured 0. `gap` belongs to the parent and no child margin can defeat it, so a
 * self-spacing Card is `flex flex-col gap-N`, never `space-y-N`.
 */
export function CardHeader({
	action,
	badge,
	className,
	description,
	headingLevel = 2,
	icon,
	id,
	identifier,
	level = 'section',
	title,
}: {
	action?: ReactNode;
	badge?: ReactNode;
	className?: string;
	description?: ReactNode;
	headingLevel?: 2 | 3 | 4 | 5 | 6;
	icon?: ReactNode;
	id?: string;
	identifier?: ReactNode;
	level?: keyof typeof headerLevels;
	title?: ReactNode;
}) {
	const Heading = `h${headingLevel}` as const;
	return (
		// `flex-wrap` up to `lg`, `flex-nowrap` from there. Wrapping is the right answer on a narrow
		// card, where the action rail genuinely has nowhere to go but the next line. It is the wrong
		// one on a wide card: `justify-between` means a title that grows by one word pushes the whole
		// action slot to line two and hard against the left edge, directly under the title it belongs
		// beside, with a full card's width of nothing to its right. One recipe card did that at
		// 2250px and half a dozen more at 1440 and 1280. From `lg` the row stays on one line and the
		// title column absorbs the growth instead, which is what `flex-1` and the callers'
		// `line-clamp` are for.
		<header
			className={cn(
				'mb-4 flex flex-wrap items-start justify-between gap-3 lg:flex-nowrap',
				className,
			)}>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					{icon !== undefined && (
						<span aria-hidden="true" className="flex shrink-0 items-center">
							{icon}
						</span>
					)}
					{title !== undefined && (
						// `min-w-0` because the heading is a flex item of this row and a flex item's
						// default `min-width: auto` is its content's min-content width. A caller
						// whose title truncates — a project name, a file name — got no truncation at
						// all without it: the heading refused to shrink below the longest unbroken
						// token and pushed past the card instead.
						<Heading className={cn('min-w-0', headerLevels[level])} id={id}>
							{title}
						</Heading>
					)}
					{badge}
				</div>
				{identifier !== undefined && (
					<p className="mt-1 truncate font-mono text-xs text-muted-foreground">
						{identifier}
					</p>
				)}
				{description !== undefined && (
					<p className={cn('mt-1 text-xs text-muted-foreground', proseMeasureClass)}>
						{description}
					</p>
				)}
			</div>
			{action}
		</header>
	);
}

/**
 * The one treatment for a card header's "go to the full page" link, previously copied verbatim into
 * six Dashboard cards with two divergent focus rings.
 *
 * The colour comes from the tone scale rather than being spelled out here: the pair this used to
 * carry was `toneText.teal` character for character, so the scale could be changed without this
 * link following. The composed class set is unchanged; only the order of the tokens differs, which
 * Tailwind does not read.
 */
export const cardHeaderLinkClass = [
	'inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium',
	// A card header's action sits alone on its row, so the touch floor costs nothing here: the
	// expansion is vertical and the negative margin cancels it, leaving the header's own height
	// unchanged. Measured at 20px before this.
	touchTargetTextClass,
	toneText.teal,
	'transition-colors outline-none',
	toneTextHoverStrong.teal,
	'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
].join(' ');
