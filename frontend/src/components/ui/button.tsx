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
		'border-cyan-700 bg-cyan-700 text-white shadow-sm shadow-cyan-950/10 hover:border-cyan-600 hover:bg-cyan-600 dark:border-cyan-400 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300',
	secondary:
		'border-border bg-card text-foreground hover:border-cyan-200 hover:bg-cyan-50/70 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30',
};

const sizes: Record<ButtonSize, string> = {
	compact: 'min-h-8 gap-1.5 px-2.5 text-xs',
	default: 'h-9 gap-2 px-3 text-sm',
	icon: 'h-9 w-9 shrink-0 px-0',
	toolbar: 'h-10 gap-2 px-3 text-sm',
};

export function buttonClassName(
	variant: ButtonVariant = 'secondary',
	className?: string,
	size: ButtonSize = 'default'
): string {
	return cn(
		'inline-flex items-center justify-center rounded-md border font-medium',
		'transition-[background-color,border-color,color,box-shadow] duration-150',
		'focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-cyan-300 dark:focus-visible:ring-offset-slate-950',
		'disabled:pointer-events-none disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400 disabled:opacity-60 disabled:shadow-none dark:disabled:border-neutral-800 dark:disabled:bg-neutral-900 dark:disabled:text-neutral-600',
		variants[variant],
		sizes[size],
		className
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
	return (
		<button
			className={buttonClassName(variant, className, size)}
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
