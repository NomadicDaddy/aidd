import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';

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

/**
 * Canonical card/section header: the single declaration of card-title typography and of how the
 * icon, title, badge, description and action slots relate to each other.
 *
 * Every slot is optional so a consumer can render just what it has without inventing a variant, and
 * `headingLevel` selects the semantic level without touching the visual treatment — a card nested
 * under an `h2` section renders `h3` and still looks identical, which is how heading order stays
 * contiguous for screen readers.
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
	title,
}: {
	action?: ReactNode;
	badge?: ReactNode;
	className?: string;
	description?: ReactNode;
	headingLevel?: 2 | 3 | 4 | 5 | 6;
	icon?: ReactNode;
	id?: string;
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
						<Heading className="text-sm font-semibold text-foreground" id={id}>
							{title}
						</Heading>
					)}
					{badge}
				</div>
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
 */
export const cardHeaderLinkClass =
	'inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-teal-700 transition-colors outline-none hover:text-teal-900 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-teal-300 dark:hover:text-teal-100';
