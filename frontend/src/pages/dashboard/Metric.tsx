import type { ReactNode } from 'react';

import { Card } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import { type Tone, toneText } from '../../lib/tones.ts';

export function Metric({
	detail,
	icon,
	label,
	loading = false,
	tone = 'neutral',
	value,
}: {
	detail?: ReactNode;
	icon?: ReactNode;
	label: string;
	loading?: boolean;
	tone?: Tone;
	value: ReactNode;
}) {
	return (
		<Card className="group flex items-center justify-between overflow-hidden" variant="panel">
			<div className="min-w-0">
				<div className="text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
					{label}
				</div>
				{loading ? (
					<div
						aria-busy="true"
						aria-label={`Loading ${label}`}
						className="mt-1 h-8 w-16 animate-pulse rounded-md bg-neutral-200/80 dark:bg-slate-800/80"
					/>
				) : (
					<div
						className={cn(
							'font-display mt-1 truncate text-2xl font-semibold text-neutral-950 tabular-nums dark:text-neutral-50',
							toneText[tone]
						)}>
						{value}
					</div>
				)}
				{loading ? (
					<div
						aria-hidden="true"
						className="mt-1 h-3 w-24 animate-pulse rounded-md bg-neutral-200/60 dark:bg-slate-800/60"
					/>
				) : (
					detail && <div className="mt-1 text-xs text-neutral-500">{detail}</div>
				)}
			</div>
			{icon && (
				<div
					aria-hidden="true"
					className={cn(
						'rounded-md border border-neutral-200 bg-neutral-50 p-2 transition-[border-color,background-color] duration-200 dark:border-neutral-800 dark:bg-slate-900',
						toneText[tone]
					)}>
					{icon}
				</div>
			)}
		</Card>
	);
}
