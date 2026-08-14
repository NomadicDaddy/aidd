import type { ReactNode } from 'react';

import { useCallback, useRef } from 'react';

import { cn } from '../../lib/cn.ts';
import { observeOverflow } from '../../lib/observeOverflow.ts';
import { Button } from './button.tsx';

/**
 * The edge treatment for a track whose options do not fit.
 *
 * Below `sm` the track is a horizontal scroller — above it the options wrap instead, so there is
 * nothing to indicate and the whole thing is `max-sm:`. The mask reads its two fade widths from
 * custom properties that default to zero, so the same single `mask-image` covers all four states:
 * a control whose options fit is masked with a hard edge at each end, which is no fade at all.
 *
 * Measured rather than assumed, which is the difference from the `SidebarNav` strip this borrows
 * from. That strip always overflows 320px so it can fade unconditionally; a two-option filter never
 * overflows, and an unconditional fade there would dim the last option — the active one, half the
 * time — to signal content that does not exist.
 */
const TRACK_FADE = [
	'max-sm:[--fade-end:0px] max-sm:[--fade-start:0px]',
	'max-sm:data-[overflow-start=true]:[--fade-start:2rem]',
	'max-sm:data-[overflow-end=true]:[--fade-end:2rem]',
	'max-sm:[mask-image:linear-gradient(to_right,transparent,black_var(--fade-start),black_calc(100%-var(--fade-end)),transparent)]',
].join(' ');

export interface SegmentedControlOption<T extends string> {
	ariaLabel?: string | undefined;
	disabled?: boolean | undefined;
	label: ReactNode;
	title?: string | undefined;
	value: T;
}

type SegmentedControlSize = 'compact' | 'default';

interface BaseSegmentedControlProps<T extends string> {
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
	ariaLabel,
	className,
	options,
	size = 'compact',
	...controlProps
}: SegmentedControlProps<T>) {
	const buttonSize = size === 'compact' ? 'compact' : 'default';
	const responsiveWidthClass = /(^|\s)w-full(\s|$)/.test(className ?? '')
		? 'sm:inline-flex sm:flex-wrap sm:overflow-visible'
		: 'sm:inline-flex sm:w-auto sm:flex-wrap sm:overflow-visible';

	const cleanupRef = useRef<(() => void) | null>(null);
	const setTrack = useCallback((track: HTMLDivElement | null) => {
		cleanupRef.current?.();
		cleanupRef.current = null;
		if (!track) return;
		// The track is its own scroller, so the flags land on the element the mask is on. No tab
		// stop is added: every option is a button and already takes focus, and a browser scrolls a
		// focused option into view on its own.
		cleanupRef.current = observeOverflow(track, (flags) => {
			track.dataset.overflowStart = String(flags.start);
			track.dataset.overflowEnd = String(flags.end);
		});
	}, []);

	return (
		<div
			aria-label={ariaLabel}
			className={cn(
				// The track is a sunken well inside whatever card holds it, so it takes `--border` /
				// `--muted` rather than raw palette steps: the filter bar is the pattern the rest of
				// the app copies, and it has to re-theme with the cards around it.
				'flex w-full max-w-full min-w-0 items-center gap-1 overflow-x-auto rounded-md border border-border bg-muted p-1',
				TRACK_FADE,
				responsiveWidthClass,
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
							'shrink-0 whitespace-nowrap',
							isActive && 'shadow-sm hover:border-border hover:bg-card',
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
						{option.label}
					</Button>
				);
			})}
		</div>
	);
}
