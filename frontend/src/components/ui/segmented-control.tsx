import type { ReactNode } from 'react';

import { default as ChevronLeft } from 'lucide-react/dist/esm/icons/chevron-left';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { useLayoutEffect, useRef } from 'react';

import { cn } from '../../lib/cn.ts';
import { observeOverflow } from '../../lib/observeOverflow.ts';
import { revealElementWithinScroller } from '../../lib/revealWithinScroller.ts';
import { Button } from './button.tsx';

/**
 * The edge treatment for a track whose options do not fit.
 *
 * Below `sm` the track is a horizontal scroller — above it the options wrap instead, so there is
 * nothing to indicate and the whole thing is `max-sm:`. The mask reads its two fade widths from
 * custom properties that default to zero, so the same single `mask-image` covers all four states:
 * a control whose options fit is masked with a hard edge at each end, which is no fade at all.
 *
 * Measured rather than assumed, matching the `SidebarNav` strip this borrows from. A two-option
 * filter may not overflow at all, and an unconditional fade would dim the last option — the active
 * one, half the time — to signal content that does not exist.
 */
const TRACK_FADE = [
	'max-sm:[--fade-end:0px] max-sm:[--fade-start:0px]',
	'max-sm:data-[overflow-start=true]:[--fade-start:2rem]',
	'max-sm:data-[overflow-end=true]:[--fade-end:2rem]',
	'max-sm:[mask-image:linear-gradient(to_right,transparent,black_var(--fade-start),black_calc(100%-var(--fade-end)),transparent)]',
].join(' ');

export interface SegmentedControlOption<T extends string> {
	ariaLabel?: string | undefined;
	count?: number | undefined;
	countAriaHidden?: boolean | undefined;
	disabled?: boolean | undefined;
	label: ReactNode;
	title?: string | undefined;
	value: T;
}

type SegmentedControlSize = 'compact' | 'default';

interface BaseSegmentedControlProps<T extends string> {
	ariaDescribedBy?: string;
	ariaLabel: string;
	className?: string;
	options: readonly SegmentedControlOption<T>[];
	size?: SegmentedControlSize;
}

interface SingleSegmentedControlProps<T extends string> extends BaseSegmentedControlProps<T> {
	onChange: (value: T) => void;
	onToggle?: never;
	value: T;
	values?: never;
}

interface MultiSegmentedControlProps<T extends string> extends BaseSegmentedControlProps<T> {
	onChange?: never;
	onToggle: (value: T) => void;
	value?: never;
	values: ReadonlySet<T>;
}

type SegmentedControlProps<T extends string> =
	MultiSegmentedControlProps<T> | SingleSegmentedControlProps<T>;

export function SegmentedControl<T extends string>({
	ariaDescribedBy,
	ariaLabel,
	className,
	options,
	size = 'compact',
	...controlProps
}: SegmentedControlProps<T>) {
	const buttonSize = size === 'compact' ? 'compact' : 'default';

	const cleanupRef = useRef<(() => void) | null>(null);
	const trackRef = useRef<HTMLDivElement | null>(null);
	const setTrack = (track: HTMLDivElement | null) => {
		cleanupRef.current?.();
		cleanupRef.current = null;
		trackRef.current = track;
		if (!track) return;
		// The track is its own scroller, so the flags land on the element the mask is on. No tab
		// stop is added: every option is a button and already takes focus, and a browser scrolls a
		// focused option into view on its own.
		cleanupRef.current = observeOverflow(track, (flags) => {
			track.dataset.overflowStart = String(flags.start);
			track.dataset.overflowEnd = String(flags.end);
			if (track.parentElement) {
				track.parentElement.dataset.overflowStart = String(flags.start);
				track.parentElement.dataset.overflowEnd = String(flags.end);
			}
		});
	};

	useLayoutEffect(() => {
		const track = trackRef.current;
		const active = track?.querySelector<HTMLElement>('[aria-pressed="true"]');
		if (!track || !active) return;
		revealElementWithinScroller(track, active, 0, 8);
	}, [controlProps]);

	return (
		<div className="group/segments relative inline-flex max-w-full min-w-0 self-start max-sm:w-full">
			<div
				aria-describedby={ariaDescribedBy}
				aria-label={ariaLabel}
				className={cn(
					// The track is a sunken well inside whatever card holds it, so it takes `--border` /
					// `--muted` rather than raw palette steps: the filter bar is the pattern the rest of
					// the app copies, and it has to re-theme with the cards around it.
					'inline-flex w-fit max-w-full min-w-0 items-center gap-1 self-start overflow-x-auto rounded-md border border-border bg-muted p-1 max-sm:flex max-sm:w-full sm:flex-wrap sm:overflow-visible',
					TRACK_FADE,
					className,
				)}
				ref={setTrack}
				role="group">
				{options.map((option) => {
					const isSingleValue = controlProps.onChange !== undefined;
					const isActive = isSingleValue
						? controlProps.value === option.value
						: controlProps.values.has(option.value);
					return (
						<Button
							aria-label={option.ariaLabel}
							aria-pressed={isActive}
							// The selected segment reads as a raised tile lifted out of the sunken
							// track, not as a second solid-accent control: a view toggle should not
							// carry the same weight as the page's primary CTA sitting beside it.
							className={cn(
								// Keep one neutral focus boundary inside the tile. The foreground token keeps
								// the inset two-pixel ring perceptible on both the muted track and selected
								// raised fill. It stays within the track gap, while outline-none suppresses
								// the global teal button outline only for these options.
								'shrink-0 rounded-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-raised-foreground focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:ring-inset',
								isActive &&
									'border-control-border bg-raised text-raised-foreground hover:border-control-border hover:bg-raised dark:hover:border-control-border dark:hover:bg-raised',
								!isActive &&
									!option.disabled &&
									'hover:border-border hover:bg-raised-hover dark:hover:border-border dark:hover:bg-raised-hover',
								option.disabled &&
									'border-transparent bg-transparent shadow-none hover:border-transparent hover:bg-transparent',
							)}
							disabled={option.disabled}
							key={option.value}
							onClick={() => {
								if (isSingleValue) {
									controlProps.onChange(option.value);
									return;
								}
								controlProps.onToggle(option.value);
							}}
							size={buttonSize}
							title={option.title}
							variant={isActive ? 'secondary' : 'ghost'}>
							{option.count === undefined ? (
								option.label
							) : (
								<span className="inline-flex items-center gap-1.5">
									{option.label}
									<span
										aria-hidden={option.countAriaHidden}
										className={cn(
											'tabular-nums',
											isActive
												? 'text-raised-foreground'
												: 'text-muted-foreground',
										)}>
										{option.count}
									</span>
								</span>
							)}
						</Button>
					);
				})}
			</div>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-6 items-center bg-gradient-to-r from-muted to-transparent pl-0.5 text-muted-foreground opacity-0 transition-opacity group-data-[overflow-start=true]/segments:opacity-100 max-sm:flex">
				<ChevronLeft className="h-4 w-4 drop-shadow-sm" />
			</span>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-6 items-center bg-gradient-to-l from-muted to-transparent pr-0.5 text-muted-foreground opacity-0 transition-opacity group-data-[overflow-end=true]/segments:opacity-100 max-sm:flex max-sm:justify-end">
				<ChevronRight className="h-4 w-4 drop-shadow-sm" />
			</span>
		</div>
	);
}
