import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';

type CardVariant = 'default' | 'panel' | 'sunken';

const variants: Record<CardVariant, string> = {
	default: 'border-border bg-card shadow-sm',
	panel: 'border-border/80 bg-card/95 shadow-[0_12px_32px_rgba(0,0,0,0.06)] backdrop-blur-sm dark:bg-card/90 dark:shadow-[0_12px_32px_rgba(0,0,0,0.3)]',
	sunken: 'border-border/80 bg-muted/90 shadow-inner',
};

export function Card({
	children,
	className,
	interactive = false,
	variant = 'default',
}: {
	children: ReactNode;
	className?: string;
	interactive?: boolean;
	variant?: CardVariant;
}) {
	return (
		<div
			className={cn(
				'rounded-xl border p-4 transition-[border-color,background-color,box-shadow] duration-200',
				variants[variant],
				interactive && 'card-hover hover:border-accent/40',
				className
			)}>
			{children}
		</div>
	);
}
