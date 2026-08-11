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

/* Every size carries a 44px floor below `sm` and restores its desk height from `sm` up. The shape is
   `SidebarNav`'s (`h-11 w-11 … sm:h-9 sm:w-auto`), generalized: not one of the four sizes reached
   44px before, so the app had no way to spell a compliant touch target — `toolbar`, which exists for
   the most prominent actions, was 40px. `compact` is 78 call sites across 40 files and is the
   working default rather than an exception, so raising it is where nearly all of the benefit is.

   The floor is `min-h-*` rather than `h-*` on purpose: a control that wraps to two lines on a narrow
   viewport has to be allowed to grow past the floor. `sm:min-h-0` then hands the height back to
   `sm:h-*`, which is what keeps the desk layout pixel-identical.

   `max-sm:min-w-11` is the same floor on the other axis, and only `icon` had it. The three padded
   sizes take their width from their content, so a short label missed the floor horizontally while
   clearing it vertically: measured at 390, `Refresh`-style icon-in-a-compact-button came out 36x44
   and the `7d` / `All` / `24h` range pickers 35.7-36.7x44. Twenty-five such controls across ten
   surfaces, all fixed here rather than at the call sites, because the call sites were not doing
   anything wrong. A label wide enough to pass already exceeds the minimum, so nothing else moves. */
const sizes: Record<ButtonSize, string> = {
	compact: 'min-h-11 gap-1.5 px-2.5 text-xs max-sm:min-w-11 sm:min-h-8',
	default: 'min-h-11 gap-2 px-3 text-sm max-sm:min-w-11 sm:h-9 sm:min-h-0',
	icon: 'h-11 w-11 shrink-0 px-0 sm:h-9 sm:w-9',
	toolbar: 'min-h-11 gap-2 px-3 text-sm max-sm:min-w-11 sm:h-10 sm:min-h-0',
};

/* A blocked action has to look blocked. Call sites signal it two ways — the native `disabled`
   attribute and `aria-disabled` — and only the first was ever styled, so an `aria-disabled` Create
   button rendered full-strength teal, pixel-identical to a live one.

   This is applied by swapping the whole variant block rather than by stacking `aria-disabled:`
   overrides on top of it: the variants carry `hover:` rules, and a hover override would have to be
   restated for every variant to keep a blocked button from lighting up under the pointer.

   The two signals differ only in how they refuse the pointer. `:disabled` is inert. `aria-disabled`
   keeps pointer events, so the control stays focusable and in the tab order and can still explain
   itself on hover — which is the whole reason a call site reaches for it.

   Stated in tokens, not in raw `neutral-*` with a `dark:` pair for each. The palette spelling was
   achromatic against an app whose greys are blue-tinted, and `opacity-60` composited the label down
   to rgb(58,59,60) on rgb(23,24,27) — a measured 1.58:1, which is not a legible disabled label but
   an invisible one. `bg-muted`/`text-muted-foreground` is the same pairing every other quiet
   surface uses and measures ~6.1:1, and the tokens flip themselves, so the `dark:` half is gone. */
const blocked =
	'cursor-not-allowed border-border bg-muted text-muted-foreground shadow-none hover:border-border hover:bg-muted';

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
