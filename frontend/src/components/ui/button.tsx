import { type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';

import { cn } from '../../lib/cn.ts';

type ButtonVariant = 'danger' | 'ghost' | 'primary' | 'secondary';
type ButtonSize = 'compact' | 'default' | 'icon' | 'toolbar';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	children: ReactNode;
	ref?: Ref<HTMLButtonElement> | undefined;
	size?: ButtonSize;
	variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
	danger: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70',
	ghost: 'border-transparent bg-transparent text-foreground hover:bg-muted',
	primary:
		'border-teal-700 bg-teal-700 text-white shadow-sm shadow-teal-950/10 hover:border-teal-600 hover:bg-teal-600 dark:border-teal-400 dark:bg-teal-400 dark:text-slate-950 dark:shadow-teal-950/20 dark:hover:bg-teal-300',
	secondary:
		'border-border bg-card text-foreground hover:border-accent/50 hover:bg-accent-muted dark:hover:border-accent/40 dark:hover:bg-accent-muted',
};

const sizes: Record<ButtonSize, string> = {
	compact: 'min-h-8 gap-1.5 px-2.5 text-xs',
	default: 'h-9 gap-2 px-3 text-sm',
	icon: 'h-9 w-9 shrink-0 px-0',
	toolbar: 'h-10 gap-2 px-3 text-sm',
};

/* A blocked action has to look blocked. Call sites signal it two ways — the native `disabled`
   attribute and `aria-disabled` — and only the first was ever styled, so an `aria-disabled` Create
   button rendered full-strength teal, pixel-identical to a live one.

   This is applied by swapping the whole variant block rather than by stacking `aria-disabled:`
   overrides on top of it: the variants carry `hover:` rules, and a hover override would have to be
   restated for every variant to keep a blocked button from lighting up under the pointer.

   The two signals differ only in how they refuse the pointer. `:disabled` is inert. `aria-disabled`
   keeps pointer events, so the control stays focusable and in the tab order and can still explain
   itself on hover — which is the whole reason a call site reaches for it. */
const blocked =
	'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400 opacity-60 shadow-none hover:border-neutral-200 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-600 dark:hover:border-neutral-800 dark:hover:bg-neutral-900';

export function buttonClassName(
	variant: ButtonVariant = 'secondary',
	className?: string,
	size: ButtonSize = 'default',
	isBlocked = false,
): string {
	return cn(
		'inline-flex items-center justify-center rounded-lg border font-medium whitespace-nowrap',
		'transition-all duration-150',
		'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
		'disabled:pointer-events-none',
		isBlocked ? blocked : variants[variant],
		sizes[size],
		className,
	);
}

export function Button({
	children,
	className,
	ref,
	size = 'default',
	variant = 'secondary',
	...props
}: ButtonProps) {
	const isBlocked =
		props.disabled === true ||
		props['aria-disabled'] === true ||
		props['aria-disabled'] === 'true';
	return (
		<button
			className={buttonClassName(variant, className, size, isBlocked)}
			ref={ref}
			type="button"
			{...props}>
			{children}
		</button>
	);
}

interface IconButtonProps extends Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	'aria-label' | 'children'
> {
	ariaLabel: string;
	children: ReactNode;
	ref?: Ref<HTMLButtonElement> | undefined;
	variant?: ButtonVariant;
}

export function IconButton({
	ariaLabel,
	children,
	className,
	ref,
	title = ariaLabel,
	variant = 'secondary',
	...props
}: IconButtonProps) {
	return (
		<Button
			aria-label={ariaLabel}
			className={className}
			ref={ref}
			size="icon"
			title={title}
			variant={variant}
			{...props}>
			{children}
		</Button>
	);
}
