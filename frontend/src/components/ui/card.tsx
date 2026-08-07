import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { toneText, toneTextHoverStrong } from '../../lib/tones.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';

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
		<header className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					{icon !== undefined && (
						<span aria-hidden="true" className="flex shrink-0 items-center">
							{icon}
						</span>
					)}
					{title !== undefined && (
						<Heading className={headerLevels[level]} id={id}>
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
					<p className="mt-1 text-xs text-muted-foreground">{description}</p>
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
