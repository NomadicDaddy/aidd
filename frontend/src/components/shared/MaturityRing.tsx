import type { ReactNode } from 'react';

import type { MaturityStageStatus, MaturityStageStatusSummary } from '../../api/types.ts';

import { cn } from '../../lib/cn.ts';

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
const TRACK_STROKE = 'rgb(229 231 235)';
const COLOR_BY_STATUS: Record<MaturityStageStatus, string> = {
	complete: 'rgb(16 185 129)',
	empty: 'rgb(212 212 216)',
	partial: 'rgb(245 158 11)',
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
					cx={cx}
					cy={cy}
					fill="none"
					r={radius}
					stroke={TRACK_STROKE}
					strokeOpacity={0.35}
					strokeWidth={stroke}
				/>
				{safeStages.map((stage, index) => {
					const startDegrees = index * (segmentDegrees + GAP_DEGREES);
					const endDegrees = startDegrees + segmentDegrees;
					const path = describeArc(cx, cy, radius, startDegrees, endDegrees);
					return (
						<path
							d={path}
							fill="none"
							key={stage.id}
							stroke={COLOR_BY_STATUS[stage.status]}
							strokeLinecap="round"
							strokeWidth={stroke}>
							<title>{`${stage.label}: ${stage.status}`}</title>
						</path>
					);
				})}
			</svg>
			{showCenterLabel ? (
				<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center text-sm leading-tight font-semibold text-foreground">
					<span>{Math.round(percent ?? 0)}%</span>
					{centerCaption ? (
						<span className="text-[10px] font-medium text-muted-foreground">
							{centerCaption}
						</span>
					) : null}
				</div>
			) : null}
		</div>
	);
}
