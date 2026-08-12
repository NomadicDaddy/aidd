import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { type Tone, toneText } from '../../lib/tones.ts';
import { Card } from '../ui/card.tsx';

/**
 * Two steps, because a strip of three headline figures and a strip of eight breakdown figures are
 * different jobs. `compact` also drops the icon slot: at this value size the icon is larger than
 * the number beside it, which is how five near-identical copies of this component came to exist.
 */
const valueSizes = {
	compact: 'text-lg',
	default: 'text-2xl',
} as const;

/**
 * A zero carries no signal, whichever label sits above it.
 *
 * Tone used to be bound to the label, so `REQUIRED MISSING 0` rendered red on Artifacts while
 * `COMPLETED 0` rendered emerald on Interview — the same reading was an alarm on one tab and a
 * success on the next, and neither was true. Nothing is missing and nothing is complete. Deriving
 * this here rather than asking each call site to remember it is the only way it stays true.
 */
function readingTone(tone: Tone, value: ReactNode): Tone {
	return value === 0 || value === '0' ? 'neutral' : tone;
}

/**
 * The one place a tone's text colour is not taken from `toneText`.
 *
 * `toneText.neutral` is `text-muted-foreground`, which is right for a badge sitting beside prose
 * and wrong for the figure a tile exists to show: an untoned reading is still the primary content
 * of its card, and muting it would make every count on Telemetry dimmer than its own label.
 */
function valueToneClass(tone: Tone): string {
	return tone === 'neutral' ? 'text-foreground' : toneText[tone];
}

export function Metric({
	className,
	compactOnMobile = false,
	detail,
	footer,
	icon,
	interactive = false,
	label,
	loading = false,
	marker,
	size = 'default',
	surface,
	tone = 'neutral',
	value,
}: {
	className?: string;
	/** Reuse the compact value and spacing below `sm`, preserving the default wider treatment. */
	compactOnMobile?: boolean;
	/** Muted caption under the value. */
	detail?: ReactNode;
	/** Full-width content below the caption — a progress bar, a link row. */
	footer?: ReactNode;
	icon?: ReactNode;
	/**
	 * Forwarded to `Card`, for the tiles that are also links.
	 *
	 * Without it the one clickable tile in the app hand-rolled `transition-colors
	 * hover:border-border` — a hover to the colour the border already was — so the only tile on the
	 * Overview that navigates was the only card on the page with no hover at all. `Card` already
	 * owns this treatment; the tile just had no way to ask for it.
	 */
	interactive?: boolean;
	label: string;
	loading?: boolean;
	/**
	 * A swatch before the label. This is for a categorical series slot, which is not a tone and
	 * must not be routed through one: the Telemetry outcome ramp shares its colours with the chart
	 * bars and legend beside it, where `emerald`-means-healthy would say the wrong thing.
	 */
	marker?: ReactNode;
	size?: keyof typeof valueSizes;
	/** Card surface; defaults to `panel` at the default size and `sunken` when compact. */
	surface?: 'panel' | 'sunken';
	tone?: Tone;
	value: ReactNode;
}) {
	const compact = size === 'compact';
	const responsiveCompact = compactOnMobile && !compact;
	const reading = readingTone(tone, value);
	return (
		// `h-full` so a strip of tiles is one height, and the reading block stacks from the top of
		// that height rather than being distributed down it. It used to be the other way round —
		// the row took `flex-1` and the left column `justify-between`, which pinned the value to
		// the bottom edge — and that made the value's position depend on whether the tile had a
		// footer. The Fleet strip measured it: four tiles at 161px, and Priority Health's value sat
		// 51px above the other three because its bar and band badge had taken 51px out of the row
		// the value was being pinned to. Stacking from the top puts every label on line one and
		// every value on line two across the whole strip, and `mt-auto` on the footer keeps the bar
		// on the tile's bottom edge, full card width, where the old layout had it.
		<Card
			className={cn(
				'flex h-full flex-col overflow-hidden',
				compact && 'p-3',
				responsiveCompact && 'p-3 sm:p-4',
				className,
			)}
			interactive={interactive}
			variant={surface ?? (compact ? 'sunken' : 'panel')}>
			<div className="flex items-stretch justify-between gap-3">
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{marker}
						<span className="min-w-0">{label}</span>
					</div>
					{/* Value and caption travel together in one block, so a tile with a caption and
					    one without still put their values on the same line. */}
					<div>
						{loading ? (
							<div
								aria-busy="true"
								aria-label={`Loading ${label}`}
								className="mt-1.5 h-8 w-16 animate-pulse rounded-lg bg-muted"
							/>
						) : (
							<div
								className={cn(
									'mt-1.5 truncate font-display font-semibold tabular-nums',
									responsiveCompact ? 'text-lg sm:text-2xl' : valueSizes[size],
									valueToneClass(reading),
								)}>
								{value}
							</div>
						)}
						{loading ? (
							<div
								aria-hidden="true"
								className="mt-1.5 h-3 w-24 animate-pulse rounded-lg bg-muted/80"
							/>
						) : (
							detail && (
								<div className="mt-1.5 text-xs text-muted-foreground">{detail}</div>
							)
						)}
					</div>
				</div>
				{icon && !compact && (
					<div
						aria-hidden="true"
						className={cn(
							'h-fit self-center rounded-xl border border-border bg-muted/60 p-2.5 transition-[border-color,background-color] duration-200',
							responsiveCompact && 'hidden sm:block',
							toneText[reading],
						)}>
						{icon}
					</div>
				)}
			</div>
			{footer !== undefined && <div className="mt-auto">{footer}</div>}
		</Card>
	);
}
