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
		<Card className="flex items-center justify-between overflow-hidden" variant="panel">
			<div className="min-w-0">
				<div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{label}
				</div>
				{loading ? (
					<div
						aria-busy="true"
						aria-label={`Loading ${label}`}
						className="mt-1.5 h-8 w-16 animate-pulse rounded-lg bg-muted"
					/>
				) : (
					<div
						className={cn(
							'mt-1.5 truncate font-display text-2xl font-semibold tabular-nums',
							toneText[tone],
						)}>
						{value}
					</div>
				)}
				{loading ? (
					<div
						aria-hidden="true"
						className="mt-1.5 h-3 w-24 animate-pulse rounded-lg bg-muted/80"
					/>
				) : (
					detail && <div className="mt-1.5 text-xs text-muted-foreground">{detail}</div>
				)}
			</div>
			{icon && (
				<div
					aria-hidden="true"
					className={cn(
						'rounded-xl border border-border bg-muted/60 p-2.5 transition-[border-color,background-color] duration-200',
						toneText[tone],
					)}>
					{icon}
				</div>
			)}
		</Card>
	);
}
