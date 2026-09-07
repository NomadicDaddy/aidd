import { type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';

import { cn } from '../../lib/cn.ts';
import { blockedDangerButtonHoverClass, dangerButtonClass } from '../../lib/tones.ts';
import { Tooltip } from './tooltip.tsx';

type ButtonVariant = 'danger' | 'ghost' | 'primary' | 'secondary';
export type ButtonSize = 'compact' | 'default' | 'icon' | 'toolbar';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	children: ReactNode;
	ref?: Ref<HTMLButtonElement> | undefined;
	size?: ButtonSize;
	variant?: ButtonVariant;
}

/* Variants are chosen by the role an action plays, not by the surface it sits on. The rule, so the
   next author has it rather than the nearest precedent:

   `primary`   The one action a surface exists to complete — submit the form, confirm the dialog,
               launch from a launch surface. At most one per surface, and never repeated down a
               list: a queue of solid plates makes every row shout and none of them lead.
   `danger`    Removes persisted work, or stops work that is running. In a table row it is spelled
               `variant="ghost"` with `dangerRowActionClass` instead, so a long table does not fill
               with red plates; the full plate is for a confirm or a dedicated destructive card.
   `secondary` Everything else affirmative: an alternative beside a primary, `Cancel` next to a
               confirm, `Retry` after an error, an empty state's suggested action, and the same
               action repeated once per row.
   `ghost`     Chrome that acts on the view rather than on the data — a filter reset inside a
               toolbar, a column chooser, a disclosure toggle, a console control — and the
               unselected members of a toggle group, whose selected member takes `secondary`.

   The same label can therefore be two roles, and that is the rule working rather than an exception:
   `Reset filters` is `ghost` in `FilterToolbar`, which is chrome, and `secondary` in `EmptyState`,
   where it is the only thing the surface is suggesting. `Discard` is `danger` in the working-tree
   toolbar, where it throws away committed-adjacent work, and `secondary` in the settings commit
   strip, where it only reverts unsaved form state.

   Three conditional forms follow the table rather than breaking it: `destructive ? 'danger' :
   'primary'` on a shared confirm, whose destructiveness is a runtime fact about one role;
   `active ? 'secondary' : 'ghost'` for the toggle-group row above; and `compact ? 'secondary' :
   'primary'` in `AppLaunchControl`, where `compact` is how that component is told it is in a row. */
const variants: Record<ButtonVariant, string> = {
	danger: dangerButtonClass,
	ghost: 'border-transparent bg-transparent text-foreground hover:bg-muted',
	primary:
		'border-accent bg-accent text-accent-foreground shadow-sm shadow-accent/10 hover:border-accent/80 hover:bg-accent/90 dark:shadow-accent/20',
	secondary:
		'border-control-border bg-card text-foreground hover:border-accent/50 hover:bg-accent-muted dark:hover:border-accent/40 dark:hover:bg-accent-muted',
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

/* A blocked action still carries its variant identity. A single replacement skin made primary and
   secondary actions identical, while using icon size as the transparent exception gave ghost text
   buttons a filled plate. These per-variant overrides keep the established hue and chrome of each
   variant, lower the whole control's visual weight, and suppress its hover response.

   Call sites signal blocking with either native `disabled` or `aria-disabled`. The latter keeps
   pointer events so a focusable control can still explain itself; both signals use this same visual
   contract. Each override therefore repeats its hover surface explicitly. */
const blockedVariants: Record<ButtonVariant, string> = {
	danger: cn('cursor-not-allowed opacity-50 shadow-none', blockedDangerButtonHoverClass),
	ghost: 'cursor-not-allowed opacity-50 shadow-none hover:border-transparent hover:bg-transparent',
	primary:
		'cursor-not-allowed border-control-border bg-card text-muted-foreground opacity-60 shadow-none hover:border-control-border hover:bg-card',
	secondary:
		'cursor-not-allowed opacity-50 shadow-none hover:border-control-border hover:bg-card dark:hover:border-control-border dark:hover:bg-card',
};

export function buttonClassName(
	variant: ButtonVariant = 'secondary',
	className?: string,
	size: ButtonSize = 'default',
	isBlocked = false,
): string {
	return cn(
		'press-feedback inline-flex items-center justify-center rounded-lg border font-medium whitespace-nowrap',
		'transition-[color,background-color,border-color,box-shadow] duration-150',
		'focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
		'disabled:pointer-events-none',
		variants[variant],
		isBlocked && blockedVariants[variant],
		sizes[size],
		className,
	);
}

export function Button({
	children,
	className,
	ref,
	size = 'default',
	title,
	variant = 'secondary',
	...props
}: ButtonProps) {
	const isBlocked =
		props.disabled === true ||
		props['aria-disabled'] === true ||
		props['aria-disabled'] === 'true';
	const button = (
		<button
			className={buttonClassName(variant, className, size, isBlocked)}
			ref={ref}
			title={isBlocked ? undefined : title}
			type="button"
			{...props}>
			{children}
		</button>
	);

	return isBlocked && title ? <Tooltip content={title}>{button}</Tooltip> : button;
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
