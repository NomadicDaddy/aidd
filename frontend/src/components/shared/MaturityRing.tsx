import type { ReactNode } from 'react';

import type { MaturityStageStatus, MaturityStageStatusSummary } from '../../api/types.ts';

import { cn } from '../../lib/cn.ts';
import { toneStroke } from '../../lib/tones.ts';

interface MaturityRingProps {
	ariaLabel?: string;
	centerCaption?: ReactNode;
	className?: string;
	percent?: number;
	showCenterLabel?: boolean;
	size?: number;
	stages: MaturityStageStatusSummary[];
}

const GAP_DEGREES = 4;

/* Painted through Tailwind `stroke-*` utilities rather than SVG `stroke` attributes so the ring
   theme-swaps like everything else. Hard-coded `rgb()` greys would make it the only graphic in
   the app that ignores the theme — and on the dark surface the brightest object in every project
   card, out-shouting the project name it belongs to.

   The tone layer declares complete class names so Tailwind can discover them while every ring
   consumer follows the shared status palette. */
const TRACK_STROKE_CLASS = 'stroke-border';
const STROKE_CLASS_BY_STATUS: Record<MaturityStageStatus, string> = {
	complete: toneStroke.emerald,
	empty: toneStroke.neutral,
	partial: toneStroke.amber,
};

function describeArc(
	cx: number,
	cy: number,
	radius: number,
	startDegrees: number,
	endDegrees: number,
): string {
	const start = polarToCartesian(cx, cy, radius, endDegrees);
	const end = polarToCartesian(cx, cy, radius, startDegrees);
	const arcDelta = endDegrees - startDegrees;
	const largeArc = arcDelta <= 180 ? 0 : 1;
	return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDegrees: number) {
	const angleRadians = ((angleDegrees - 90) * Math.PI) / 180;
	return {
		x: cx + radius * Math.cos(angleRadians),
		y: cy + radius * Math.sin(angleRadians),
	};
}

export function MaturityRing({
	ariaLabel,
	centerCaption,
	className,
	percent,
	showCenterLabel = false,
	size = 56,
	stages,
}: MaturityRingProps) {
	const count = stages.length || 1;
	const cx = size / 2;
	const cy = size / 2;
	const stroke = Math.max(4, Math.round(size * 0.1));
	const radius = (size - stroke) / 2;
	const segmentDegrees = (360 - GAP_DEGREES * count) / count;
	const safeStages =
		stages.length > 0
			? stages
			: ([
					{ id: 'specified', label: 'Specified', status: 'empty' },
				] as MaturityStageStatusSummary[]);
	return (
		<div
			aria-label={ariaLabel ?? 'Project maturity ring'}
			className={cn('relative inline-flex items-center justify-center', className)}
			role="img"
			style={{ height: size, width: size }}>
			<svg height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
				<circle
					className={TRACK_STROKE_CLASS}
					cx={cx}
					cy={cy}
					fill="none"
					r={radius}
					strokeWidth={stroke}
				/>
				{safeStages.map((stage, index) => {
					const startDegrees = index * (segmentDegrees + GAP_DEGREES);
					const endDegrees = startDegrees + segmentDegrees;
					const path = describeArc(cx, cy, radius, startDegrees, endDegrees);
					return (
						<path
							className={cn(
								STROKE_CLASS_BY_STATUS[stage.status],
								// An untouched stage is background, not a reading. Dimming it
								// keeps the ring from presenting "nothing has happened yet" at
								// the same weight as a completed stage.
								stage.status === 'empty' && 'opacity-40',
							)}
							d={path}
							fill="none"
							key={stage.id}
							strokeLinecap="round"
							strokeWidth={stroke}>
							<title>{`${stage.label}: ${stage.status}`}</title>
						</path>
					);
				})}
			</svg>
			{showCenterLabel ? (
				<div
					className={cn(
						'pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center leading-tight font-semibold text-foreground',
						size <= 36 ? 'text-2xs tabular-nums' : 'text-sm',
					)}>
					<span>{Math.round(percent ?? 0)}%</span>
					{centerCaption ? (
						<span className="text-2xs font-medium text-muted-foreground">
							{centerCaption}
						</span>
					) : null}
				</div>
			) : null}
		</div>
	);
}
