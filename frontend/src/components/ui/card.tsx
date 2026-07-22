import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';

type CardVariant = 'default' | 'panel' | 'sunken';

const variants: Record<CardVariant, string> = {
	default: 'border-border bg-card shadow-sm',
	panel: 'border-neutral-200/80 bg-white/90 shadow-[0_14px_40px_rgba(15,23,42,0.08)] backdrop-blur dark:border-cyan-950/60 dark:bg-slate-950/72 dark:shadow-[0_16px_48px_rgba(0,0,0,0.36)]',
	sunken: 'border-neutral-200/80 bg-neutral-50/90 shadow-inner dark:border-neutral-800 dark:bg-slate-950/60',
};

export function Card({
	children,
	className,
	variant = 'default',
}: {
	children: ReactNode;
	className?: string;
	variant?: CardVariant;
}) {
	return (
		<div
			className={cn(
				'rounded-lg border p-4 transition-[border-color,background-color,box-shadow] duration-200',
				variants[variant],
				className
			)}>
			{children}
		</div>
	);
}
