import type { ReactNode } from 'react';

import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import { cn } from '../../lib/cn.ts';
import { type Tone, toneText } from '../../lib/tones.ts';
import { microLabelClass } from '../../lib/typography.ts';
import { Button } from '../ui/button.tsx';
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
 * Tone bound to the label alone would render `REQUIRED MISSING 0` red on Artifacts and
 * `COMPLETED 0` emerald on Interview — the same reading as an alarm on one tab and a success on
 * the next, and neither true. Nothing is missing and nothing is complete. Deriving this here
 * rather than asking each call site to remember it is the only way it stays true.
 */
function readingTone(tone: Tone, value: ReactNode): Tone {
	if (value === 0) return 'neutral';
	if (typeof value !== 'string') return tone;
	return /^[+-]?0(?:\.0+)?%?$/u.test(value.trim()) ? 'neutral' : tone;
}

function MetricLabel({
	headingLevel,
	label,
}: {
	headingLevel: 2 | 3 | 4 | undefined;
	label: string;
}) {
	const Label =
		headingLevel === 2 ? 'h2' : headingLevel === 3 ? 'h3' : headingLevel === 4 ? 'h4' : 'span';
	return <Label className="min-w-0">{label}</Label>;
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
	error,
	footer,
	headingLevel,
	icon,
	interactive = false,
	label,
	loading = false,
	marker,
	size = 'default',
	surface,
	tone = 'neutral',
	value,
	wrapValue = false,
}: {
	className?: string;
	/** Reuse the compact value and spacing below `sm`, preserving the default wider treatment. */
	compactOnMobile?: boolean;
	/** Muted caption under the value. */
	detail?: ReactNode;
	/**
	 * A failed load, shown in place of the value and its caption.
	 *
	 * A tile that keeps rendering a figure through a failed query reports a number nobody
	 * measured, in the same type as one somebody did. On the Overview that figure was assembled
	 * from whichever sibling query happened to survive, so the reading was at its most confident
	 * -- a whole fleet, every project healthy -- exactly when the page had received the least.
	 * The retry sits inside the tile because the tile is what failed.
	 */
	error?: { message: string; onRetry: () => void } | undefined;
	/** Full-width content below the caption — a progress bar, a link row. */
	footer?: ReactNode;
	/** Heading level when the tile labels a standalone region; inline tiles remain unheaded. */
	headingLevel?: 2 | 3 | 4;
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
	/**
	 * The reading's status assertion from `lib/tones.ts`. Amber requires an explicit attention
	 * state or named band/threshold; the fact that a count is non-zero is not such a band.
	 */
	tone?: Tone;
	value: ReactNode;
	/** Long timestamps and progress descriptions retain their complete reading. */
	wrapValue?: boolean;
}) {
	const compact = size === 'compact';
	const responsiveCompact = compactOnMobile && !compact;
	// A tone asserts something about a reading, and in the error state there is no reading.
	// Left alone, a red tile would have kept its red on the failure that replaced it.
	const reading = error ? 'neutral' : readingTone(tone, value);
	return (
		// `h-full` so a strip of tiles is one height, and the reading block stacks from the top of
		// that height rather than being distributed down it. Distributing it — the row on `flex-1`
		// and the left column on `justify-between`, pinning the value to the bottom edge — makes
		// the value's position depend on whether the tile has a footer. The Fleet strip measures
		// it: four tiles at 161px, and Priority Health's value would sit 51px above the other three
		// because its bar and band badge take 51px out of the row the value is pinned to. Stacking
		// from the top puts every label on line one and every value on line two across the whole
		// strip, and `mt-auto` on the footer keeps the bar on the tile's bottom edge, full card
		// width.
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
					<div
						className={cn(
							'flex items-center gap-2 text-muted-foreground',
							microLabelClass,
						)}>
						{marker}
						<MetricLabel headingLevel={headingLevel} label={label} />
					</div>
					{/* Value and caption travel together in one block, so a tile with a caption and
					    one without still put their values on the same line. */}
					<div>
						{error ? (
							<div className="mt-1.5 flex flex-col items-start gap-2">
								<p className="text-sm text-muted-foreground">{error.message}</p>
								<Button
									className="text-xs"
									onClick={error.onRetry}
									variant="secondary">
									<RefreshCw className="h-3.5 w-3.5" />
									Retry
								</Button>
							</div>
						) : loading ? (
							<div
								aria-busy="true"
								aria-label={`Loading ${label}`}
								className="mt-1.5 h-8 w-16 animate-pulse rounded-lg bg-muted"
								role="status"
							/>
						) : (
							<div
								className={cn(
									'mt-1.5 font-display font-semibold tabular-nums',
									wrapValue ? 'break-words whitespace-normal' : 'truncate',
									responsiveCompact ? 'text-lg sm:text-2xl' : valueSizes[size],
									valueToneClass(reading),
								)}>
								{value}
							</div>
						)}
						{error ? null : loading ? (
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
