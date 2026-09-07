import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { toneText, toneTextHoverStrong } from '../../lib/tones.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { proseMeasureClass } from '../../lib/typography.ts';

type CardVariant = 'default' | 'panel' | 'sunken';

type CardHeaderActionLayout = 'default' | 'stacked';

const variants: Record<CardVariant, string> = {
	default: 'border-border bg-card shadow-sm',
	panel: 'border-border/80 bg-card/95 shadow-[0_12px_32px_rgba(0,0,0,0.06)] backdrop-blur-sm dark:bg-card/90 dark:shadow-[0_12px_32px_rgba(0,0,0,0.3)]',
	sunken: 'border-border/80 bg-muted/90 shadow-inner',
};

export function Card({
	'aria-labelledby': ariaLabelledBy,
	children,
	className,
	'data-content-rail': dataContentRail,
	interactive = false,
	role,
	variant = 'default',
}: {
	'aria-labelledby'?: string;
	children: ReactNode;
	className?: string;
	'data-content-rail'?: string;
	interactive?: boolean;
	role?: 'group' | 'region';
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
			)}
			data-content-rail={dataContentRail}
			role={role ?? (ariaLabelledBy ? 'group' : undefined)}>
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
 * icon, title, identifier, badge, status, description and action slots relate to each other.
 *
 * Every slot is optional so a consumer can render just what it has without inventing a variant.
 * `identifier` is the mono line under the title — a recipe id, a skill id, a file path — and it
 * exists because its absence is what made Recipes and Skills hand-roll their own header instead.
 * `badge` classifies the identity, `status` reports its current state, and `action` is reserved for
 * commands. Status stays in the identity rail so it cannot occupy the command position.
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
	actionLayout = 'default',
	badge,
	className,
	description,
	descriptionClassName,
	headingLevel = 2,
	icon,
	id,
	identifier,
	level = 'section',
	status,
	title,
}: {
	action?: ReactNode;
	actionLayout?: CardHeaderActionLayout;
	badge?: ReactNode;
	className?: string;
	description?: ReactNode;
	descriptionClassName?: string;
	headingLevel?: 2 | 3 | 4 | 5 | 6;
	icon?: ReactNode;
	id?: string;
	identifier?: ReactNode;
	level?: keyof typeof headerLevels;
	status?: ReactNode;
	title?: ReactNode;
}) {
	const Heading = `h${headingLevel}` as const;
	const hasAction = action !== undefined;
	const usesStackedActionLayout = hasAction && actionLayout === 'stacked';
	const identity = (
		<div
			className={cn(
				'min-w-0 flex-1',
				hasAction &&
					(usesStackedActionLayout
						? '@min-[32rem]:min-w-[min(100%,16rem)] @min-[32rem]:basis-64'
						: 'min-w-[min(100%,16rem)] basis-64'),
			)}>
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
				{status !== undefined && (
					<div
						className="flex max-w-full flex-wrap items-center gap-2"
						data-slot="card-header-status">
						{status}
					</div>
				)}
			</div>
			{identifier !== undefined && (
				<p className="mt-1 truncate font-mono text-xs text-muted-foreground">
					{identifier}
				</p>
			)}
			{description !== undefined && (
				<p
					className={cn(
						'mt-1 text-xs text-muted-foreground',
						proseMeasureClass,
						descriptionClassName,
					)}>
					{description}
				</p>
			)}
		</div>
	);
	const content = (
		<>
			{identity}
			{hasAction ? (
				<div className="max-w-full shrink-0" data-slot="card-header-actions">
					{action}
				</div>
			) : null}
		</>
	);

	return (
		// Every horizontal action row reserves 16rem for the card identity. The action keeps its
		// natural width, so flex-wrap moves it beneath the identity instead of shrinking the title and
		// description to zero. Action-heavy consumers still opt into a guaranteed vertical layout
		// below 32rem; above it, the same floor decides whether the two columns actually fit.
		<header
			className={cn(
				'mb-4',
				usesStackedActionLayout
					? '@container'
					: 'flex flex-wrap items-start justify-between gap-3',
				className,
			)}>
			{usesStackedActionLayout ? (
				<div className="flex flex-col items-stretch justify-between gap-3 @min-[32rem]:flex-row @min-[32rem]:flex-wrap @min-[32rem]:items-start">
					{content}
				</div>
			) : (
				content
			)}
		</header>
	);
}

/**
 * The one treatment for a card header's "go to the full page" link, shared by the six Dashboard
 * cards so they cannot drift into divergent focus rings.
 *
 * The colour comes from the tone scale rather than being spelled out here: spelling out the
 * `toneText.teal` pair character for character would let the scale change without this link
 * following.
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
	'focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
].join(' ');
