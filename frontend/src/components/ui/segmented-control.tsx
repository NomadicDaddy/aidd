import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { Button } from './button.tsx';

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
	return (
		<div
			aria-label={ariaLabel}
			className={cn(
				// The track is a sunken well inside whatever card holds it, so it takes `--border` /
				// `--muted` rather than raw palette steps: the filter bar is the pattern the rest of
				// the app copies, and it has to re-theme with the cards around it.
				'flex w-full max-w-full min-w-0 items-center gap-1 overflow-x-auto rounded-md border border-border bg-muted p-1',
				responsiveWidthClass,
				className,
			)}
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
						className="shrink-0 whitespace-nowrap"
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
						variant={isActive ? 'primary' : 'ghost'}>
						{option.label}
					</Button>
				);
			})}
		</div>
	);
}
